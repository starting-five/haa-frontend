import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import es from "../../../../messages/es.json";

// Case Summary edits who was with the patient and the documents on the case,
// like every other section: the pencil opens a sheet, the sheet changes a
// draft, and only Save sends the change. The patient's own phone and email stay
// locked; a companion's cell number and email are the patient's answers about
// someone else and can be corrected. A file is uploaded when it is picked, so a
// file that is never saved is deleted again. Thumbnails of stored files come
// through the app's own route, because the bucket cannot be read by the browser.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/case/s-1",
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);

const services = vi.hoisted(() => ({
  save: vi.fn(),
  uploadUrl: vi.fn(),
  deleteDocument: vi.fn(),
}));
vi.mock("@/services/intake", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/intake")>();
  return {
    ...actual,
    saveCaseSummary: services.save,
    createDocumentUploadUrl: services.uploadUrl,
    deleteDocument: services.deleteDocument,
  };
});
const upload = vi.hoisted(() => vi.fn());
vi.mock("@/lib/signed-upload", () => ({ uploadToSignedUrl: upload }));
// a photo is sent as it was picked here; the re-encoding has its own tests
vi.mock("@/hooks/use-supabase-upload", () => ({ convertImageToWebp: async (file: File) => file }));
vi.mock("@/lib/preview-thumbnail", () => ({
  createPreviewThumbnail: async () => "data:image/webp;base64,UklGRg==",
}));

import type { CaseSummary } from "@/services/intake";
import { CaseSummaryScreen } from "../case-summary-screen";

const LENA = {
  id: "c-1",
  firstName: "Lena",
  lastName: "Hale",
  relation: "passenger",
  cellNumber: "(407) 555-0101",
  email: null,
};

const summaryWith = (overrides: Partial<CaseSummary> = {}): CaseSummary => ({
  submissionId: "s-1",
  status: "submitted",
  submittedAt: "2026-09-08T12:00:00.000Z",
  firstName: "Jessica",
  lastName: "Hale",
  phone: "+15551230888",
  email: "jessica@example.test",
  incidentType: "car",
  incidentDate: "2026-09-05",
  incidentLocation: "Springfield, IL 62704",
  incidentLocationDetails: null,
  role: "driver",
  injuries: "back",
  treatmentArea: "Orlando, FL 32801",
  treatmentAreaLocationDetails: null,
  companions: [LENA],
  documents: [
    { id: "d-1", fileName: "police-report.pdf", mimeType: "application/pdf", category: "accidentReport" },
    { id: "d-2", fileName: "card.jpg", mimeType: "image/jpeg", category: "insuranceCard" },
  ],
  editable: true,
  ...overrides,
});

const renderScreen = (summary: CaseSummary = summaryWith(), locale: "en" | "es" = "en") =>
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "es" ? es : en}
    >
      <CaseSummaryScreen
        locale={locale}
        initialSummary={summary}
      />
    </NextIntlClientProvider>
  );

const t = en.CaseSummary;
const tr = en.IntakeReview;
const tw = en.IntakeWhoWasWithYou;
const te = en.IntakeEvidence;
const dialog = () => screen.getByRole("dialog");
// FloatingInput draws its label without a <label> element, so fields are found by id, as the intake's tests do
const field = (id: string) => document.getElementById(id) as HTMLInputElement;
// thumbnails carry "<category> preview" as their alt text; the header's logo is the other image
const thumbnails = () =>
  screen.getAllByRole("img").filter((image) => / preview$/.test(image.getAttribute("alt") ?? ""));
const saveScreen = () => fireEvent.click(screen.getByRole("button", { name: t.save }));
const sentBody = () => services.save.mock.calls[0]?.[1] as Record<string, unknown>;

describe("Case Summary — who was with you", () => {
  beforeEach(() => {
    push.mockReset();
    services.save.mockReset().mockImplementation(async () => summaryWith());
  });

  it("has a pencil that opens the people on the case", () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: t.editCompanionsTitle }));

    expect(within(dialog()).getByRole("heading", { name: t.editCompanionsTitle })).toBeInTheDocument();
    expect(within(dialog()).getByText("Lena Hale")).toBeInTheDocument();
    expect(within(dialog()).getByText("(407) 555-0101")).toBeInTheDocument();
  });

  it("edits a person and adds another, and Save sends the whole list with the kept id", async () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: t.editCompanionsTitle }));

    fireEvent.click(within(dialog()).getByRole("button", { name: `${tw.edit} Lena` }));
    fireEvent.change(field("caseCompanionLastName"), { target: { value: "Ortega" } });
    fireEvent.change(field("caseCompanionEmail"), { target: { value: "lena@example.test" } });
    fireEvent.click(within(dialog()).getByRole("button", { name: tw.saveChanges }));

    fireEvent.click(within(dialog()).getByRole("button", { name: tw.addPerson }));
    fireEvent.change(field("caseCompanionFirstName"), { target: { value: "Omar" } });
    fireEvent.click(within(dialog()).getByRole("button", { name: tw.relationOther }));
    fireEvent.change(field("caseCompanionCell"), { target: { value: "4075550102" } });
    fireEvent.click(within(dialog()).getByRole("button", { name: tw.addPersonCta }));
    fireEvent.click(within(dialog()).getByRole("button", { name: tr.saveChanges }));

    expect(screen.getByText(/Lena Ortega/)).toBeInTheDocument();
    expect(screen.getByText(/Omar/)).toBeInTheDocument();

    saveScreen();
    await waitFor(() => expect(services.save).toHaveBeenCalledTimes(1));
    expect(sentBody()).toEqual({
      companions: [
        {
          id: "c-1",
          firstName: "Lena",
          lastName: "Ortega",
          relation: "passenger",
          cellNumber: "(407) 555-0101",
          email: "lena@example.test",
        },
        { firstName: "Omar", lastName: "", relation: "other", cellNumber: "(407) 555-0102", email: null },
      ],
    });
  });

  it("removes a person, and Save sends the list without them", async () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: t.editCompanionsTitle }));
    fireEvent.click(within(dialog()).getByRole("button", { name: `${tw.remove} Lena` }));
    expect(within(dialog()).getByText(t.noCompanions)).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole("button", { name: tr.saveChanges }));

    saveScreen();
    await waitFor(() => expect(services.save).toHaveBeenCalledTimes(1));
    expect(sentBody()).toEqual({ companions: [] });
  });

  it("asks for a relation and a full cell number before a person is added, as the intake does", () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: t.editCompanionsTitle }));
    fireEvent.click(within(dialog()).getByRole("button", { name: tw.addPerson }));
    fireEvent.change(field("caseCompanionFirstName"), { target: { value: "Omar" } });
    fireEvent.change(field("caseCompanionCell"), { target: { value: "407555" } });
    fireEvent.click(within(dialog()).getByRole("button", { name: tw.addPersonCta }));

    expect(within(dialog()).getByText(tw.theyWereRequired)).toBeInTheDocument();
    expect(within(dialog()).getByText(tw.cellNumberRequired)).toBeInTheDocument();
    // still on the form: nobody was added
    expect(within(dialog()).getByRole("heading", { name: tw.addPersonHeading })).toBeInTheDocument();
  });

  it("does not offer Driver to a patient who was the driver", () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: t.editCompanionsTitle }));
    fireEvent.click(within(dialog()).getByRole("button", { name: tw.addPerson }));

    expect(within(dialog()).queryByRole("button", { name: tw.relationDriver })).toBeNull();
    expect(within(dialog()).getByRole("button", { name: tw.relationPassenger })).toBeInTheDocument();
  });

  it("Cancel leaves the people as they were and nothing to save", () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: t.editCompanionsTitle }));
    fireEvent.click(within(dialog()).getByRole("button", { name: `${tw.remove} Lena` }));
    fireEvent.click(within(dialog()).getByRole("button", { name: tr.cancel }));

    expect(screen.getByText(/Lena Hale/)).toBeInTheDocument();
    saveScreen();
    expect(services.save).not.toHaveBeenCalled();
  });

  it("shows the list without a pencil when the backend sends no companion ids (an older backend)", () => {
    renderScreen(summaryWith({ companions: [{ firstName: "Lena", lastName: "Hale", relation: "passenger" }] }));

    expect(screen.getByText(/Lena Hale/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.editCompanionsTitle })).toBeNull();
    expect(screen.getByRole("button", { name: t.editDocumentsTitle })).toBeInTheDocument();
  });
});

describe("Case Summary — who was with you, as the intake stored it", () => {
  beforeEach(() => {
    push.mockReset();
    services.save.mockReset().mockImplementation(async () => summaryWith());
  });

  it("takes a name the intake would take, digits included, and saves it", async () => {
    renderScreen(summaryWith({ role: "passenger" }));
    fireEvent.click(screen.getByRole("button", { name: t.editCompanionsTitle }));
    fireEvent.click(within(dialog()).getByRole("button", { name: tw.addPerson }));
    fireEvent.change(field("caseCompanionFirstName"), { target: { value: "2nd" } });
    fireEvent.change(field("caseCompanionLastName"), { target: { value: "Bro" } });
    fireEvent.click(within(dialog()).getByRole("button", { name: tw.relationDriver }));
    fireEvent.change(field("caseCompanionCell"), { target: { value: "1111111111" } });
    fireEvent.click(within(dialog()).getByRole("button", { name: tw.addPersonCta }));
    fireEvent.click(within(dialog()).getByRole("button", { name: tr.saveChanges }));

    saveScreen();
    await waitFor(() => expect(services.save).toHaveBeenCalledTimes(1));
    expect((sentBody().companions as { firstName: string }[]).map((person) => person.firstName)).toEqual([
      "Lena",
      "2nd",
    ]);
  });

  it("flags a person saved before these rules and keeps the sheet from saving until they are updated", () => {
    renderScreen(
      summaryWith({
        role: "passenger",
        companions: [{ ...LENA, relation: "friend", cellNumber: "5550100", email: null }],
      })
    );
    fireEvent.click(screen.getByRole("button", { name: t.editCompanionsTitle }));

    expect(within(dialog()).getByTestId("companion-needs-update")).toHaveTextContent(t.companionNeedsUpdate);
    const sheetSave = within(dialog()).getByRole("button", { name: tr.saveChanges }) as HTMLButtonElement;
    expect(sheetSave.disabled).toBe(true);

    fireEvent.click(within(dialog()).getByRole("button", { name: `${tw.edit} Lena` }));
    // the retired relation is asked for again and the short number shows as typed so far
    fireEvent.click(within(dialog()).getByRole("button", { name: tw.relationPassenger }));
    fireEvent.change(field("caseCompanionCell"), { target: { value: "4075550100" } });
    fireEvent.click(within(dialog()).getByRole("button", { name: tw.saveChanges }));

    expect(within(dialog()).queryByTestId("companion-needs-update")).toBeNull();
    expect((within(dialog()).getByRole("button", { name: tr.saveChanges }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("Case Summary — documents", () => {
  beforeEach(() => {
    push.mockReset();
    services.save.mockReset().mockImplementation(async () => summaryWith());
    services.uploadUrl
      .mockReset()
      .mockImplementation(async ({ fileName, category }: { fileName: string; category: string }) => ({
        bucket: "submissions",
        storagePath: `s-1/${category}/${fileName.replace(".", "-abcd1234.")}`,
        token: "upload-token",
      }));
    services.deleteDocument.mockReset().mockResolvedValue(undefined);
    upload.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:local", revokeObjectURL: () => undefined }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const pick = async (category: string, source: string, files: File[]) => {
    fireEvent.click(within(dialog()).getByRole("button", { name: t.addDocument }));
    fireEvent.click(within(dialog()).getByRole("button", { name: category }));
    fireEvent.click(within(dialog()).getByRole("button", { name: source }));
    await act(async () => {
      fireEvent.change(screen.getByTestId("case-document-input"), { target: { files } });
    });
  };
  const photo = (name = "front.jpg", type = "image/jpeg") => new File([new Uint8Array(2048)], name, { type });

  it("shows a stored image through the patient's own route, and a PDF by its type", () => {
    renderScreen();

    const images = thumbnails();
    // same-origin: next/image writes it out against the page's own origin
    expect(images.map((image) => new URL(image.getAttribute("src") ?? "", window.location.href))).toEqual([
      new URL("/api/case/s-1/documents/d-2", window.location.href),
    ]);
    expect(screen.getByText("police-report.pdf")).toBeInTheDocument();
  });

  it("removes a stored document, and Save sends its id", async () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: t.editDocumentsTitle }));
    fireEvent.click(
      within(dialog()).getByRole("button", { name: te.removeFile.replace("{fileName}", "police-report.pdf") })
    );
    fireEvent.click(within(dialog()).getByRole("button", { name: tr.saveChanges }));

    expect(screen.queryByText("police-report.pdf")).toBeNull();
    saveScreen();
    await waitFor(() => expect(services.save).toHaveBeenCalledTimes(1));
    expect(sentBody()).toEqual({ documents: { add: [], remove: ["d-1"] } });
    expect(services.deleteDocument).not.toHaveBeenCalled();
  });

  it("uploads a picked photo into the chosen category, shows its preview, and Save records it", async () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: t.editDocumentsTitle }));
    await pick(te.category.insuranceCard, te.source.choosePhotos, [photo()]);

    expect(services.uploadUrl).toHaveBeenCalledWith({
      submissionId: "s-1",
      fileName: "front.jpg",
      category: "insuranceCard",
    });
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "submissions",
        storagePath: "s-1/insuranceCard/front-abcd1234.jpg",
        token: "upload-token",
      })
    );
    await waitFor(() => expect(within(dialog()).getByText("front.jpg")).toBeInTheDocument());
    fireEvent.click(within(dialog()).getByRole("button", { name: tr.saveChanges }));
    expect(thumbnails().map((image) => image.getAttribute("src"))).toContain("data:image/webp;base64,UklGRg==");

    saveScreen();
    await waitFor(() => expect(services.save).toHaveBeenCalledTimes(1));
    expect(sentBody()).toEqual({
      documents: {
        add: [
          {
            storagePath: "s-1/insuranceCard/front-abcd1234.jpg",
            fileName: "front.jpg",
            mimeType: "image/jpeg",
            fileSize: 2048,
            category: "insuranceCard",
          },
        ],
        remove: [],
      },
    });
    // recorded by Save, so it is kept
    expect(services.deleteDocument).not.toHaveBeenCalled();
  });

  it("refuses a file the category cannot hold, before anything is uploaded", async () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: t.editDocumentsTitle }));
    await pick(te.category.incidentPhotos, te.source.choosePhotos, [photo("notes.txt", "text/plain")]);

    expect(within(dialog()).getByRole("alert")).toHaveTextContent(te.rejectedTypeImage);
    expect(services.uploadUrl).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("deletes an upload the patient took out again, even though nothing is left to save", async () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: t.editDocumentsTitle }));
    await pick(te.category.insuranceCard, te.source.choosePhotos, [photo()]);
    await waitFor(() => expect(within(dialog()).getByText("front.jpg")).toBeInTheDocument());
    fireEvent.click(within(dialog()).getByRole("button", { name: te.removeFile.replace("{fileName}", "front.jpg") }));
    fireEvent.click(within(dialog()).getByRole("button", { name: tr.saveChanges }));

    saveScreen();
    expect(services.save).not.toHaveBeenCalled();
    expect(services.deleteDocument).toHaveBeenCalledWith({
      submissionId: "s-1",
      storagePath: "s-1/insuranceCard/front-abcd1234.jpg",
    });
    expect(push).toHaveBeenCalledWith("/en/intake/dashboard");
  });

  it("deletes unsaved uploads when the patient discards the edits", async () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: t.editDocumentsTitle }));
    await pick(te.category.insuranceCard, te.source.choosePhotos, [photo()]);
    await waitFor(() => expect(within(dialog()).getByText("front.jpg")).toBeInTheDocument());
    fireEvent.click(within(dialog()).getByRole("button", { name: tr.saveChanges }));

    const link = document.createElement("a");
    link.href = "/en/intake/dashboard";
    document.body.appendChild(link);
    act(() => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });
    link.remove();
    fireEvent.click(screen.getByRole("button", { name: t.discard }));

    expect(services.deleteDocument).toHaveBeenCalledWith({
      submissionId: "s-1",
      storagePath: "s-1/insuranceCard/front-abcd1234.jpg",
    });
    expect(services.save).not.toHaveBeenCalled();
  });
});

describe("Case Summary — what stays locked", () => {
  it("has no pencils at all on a case the backend no longer lets the patient change", () => {
    renderScreen(summaryWith({ editable: false }));

    expect(screen.queryByRole("button", { name: t.editCompanionsTitle })).toBeNull();
    expect(screen.queryByRole("button", { name: t.editDocumentsTitle })).toBeNull();
  });

  it("never sends the patient's own phone or email, whatever is edited", async () => {
    services.save.mockReset().mockImplementation(async () => summaryWith());
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: t.editCompanionsTitle }));
    fireEvent.click(within(dialog()).getByRole("button", { name: `${tw.remove} Lena` }));
    fireEvent.click(within(dialog()).getByRole("button", { name: tr.saveChanges }));
    saveScreen();

    await waitFor(() => expect(services.save).toHaveBeenCalledTimes(1));
    const body = JSON.stringify(sentBody());
    expect(body).not.toContain("+15551230888");
    expect(body).not.toContain("jessica@example.test");
  });

  it("names the new pencils in Spanish on the Spanish route", () => {
    renderScreen(summaryWith(), "es");

    expect(screen.getByRole("button", { name: es.CaseSummary.editCompanionsTitle })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: es.CaseSummary.editDocumentsTitle })).toBeInTheDocument();
  });
});
