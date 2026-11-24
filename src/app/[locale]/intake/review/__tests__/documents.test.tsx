import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en.json";
import spanish from "../../../../../../messages/es.json";

// The case summary has its own Documents row: how many the case will submit,
// what they are, and a pencil that opens the evidence screen to change them.
// The number has to come from the same records the submit payload is built
// from, or the patient is told one thing and the attorney receives another.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/intake/review",
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);
vi.mock("@/hooks/use-require-session-key", () => ({ useRequireSessionKey: () => {} }));
vi.mock("@/hooks/use-preload-images", () => ({ usePreloadImages: () => {} }));

const completeIntake = vi.fn();
vi.mock("@/services/intake", () => ({
  completeIntake: (...args: unknown[]) => completeIntake(...args),
}));
vi.mock("@/lib/intake-session", () => ({ clearIntakeSessionAfterSubmit: vi.fn() }));

import IntakeReviewPage from "../page";

const renderPage = () =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
    >
      <IntakeReviewPage />
    </NextIntlClientProvider>
  );

const saveDocuments = (documents: unknown[]) => sessionStorage.setItem("intake_documents", JSON.stringify(documents));

const document_ = (fileName: string, category: string, submission = "sub-1") => ({
  fileName,
  storagePath: `${submission}/${category}/${fileName.replace(".", "-1.")}`,
  mimeType: fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
  fileSize: 2048,
  category,
});

const count = () => screen.getByTestId("review-document-count").textContent;

// A real 2x2 WebP, so the row is drawn from an actual image rather than from a
// string that happens to start with "data:".
const REAL_WEBP =
  "data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA";

const savePreviews = (previews: Record<string, string>) =>
  sessionStorage.setItem("intake_document_previews", JSON.stringify(previews));

/** The Documents section only — the page header carries a logo image too. */
const documentsSection = () => {
  const section = screen.getByTestId("review-document-count").closest("section");
  if (!(section instanceof HTMLElement)) throw new Error("no Documents section");
  return section;
};

const documentImages = () => within(documentsSection()).queryAllByRole("img");

const rowFor = (fileName: string) => {
  const row = screen.getByTitle(fileName).closest("li");
  if (!(row instanceof HTMLElement)) throw new Error(`no row for ${fileName}`);
  return row;
};

describe("the Documents row on the case summary", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    push.mockReset();
    completeIntake.mockReset();
    sessionStorage.clear();
    sessionStorage.setItem("intake_submissionId", "sub-1");
    sessionStorage.setItem("intake_treatmentArea", "Austin, TX");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("says so plainly when nothing has been attached", () => {
    renderPage();
    expect(count()).toBe("No documents added");
    expect(screen.queryAllByTestId("review-document")).toHaveLength(0);
  });

  it("counts what the case will submit, and names each document with its category", () => {
    saveDocuments([document_("police-report.pdf", "accidentReport"), document_("crash.jpg", "incidentPhotos")]);
    renderPage();

    expect(count()).toBe("2 documents added");
    const rows = screen.getAllByTestId("review-document");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("police-report.pdf");
    expect(rows[0]).toHaveTextContent(messages.IntakeEvidence.category.accidentReport);
    expect(rows[1]).toHaveTextContent("crash.jpg");
    expect(rows[1]).toHaveTextContent(messages.IntakeEvidence.category.incidentPhotos);
  });

  it("does not count a record left behind by an earlier intake in the same tab", () => {
    saveDocuments([document_("mine.pdf", "accidentReport"), document_("theirs.pdf", "accidentReport", "sub-0")]);
    renderPage();

    expect(count()).toBe("1 document added");
    expect(screen.getAllByTestId("review-document")).toHaveLength(1);
    expect(screen.getByTestId("review-document")).toHaveTextContent("mine.pdf");
  });

  it("keeps the row separate from the recovery details", () => {
    saveDocuments([document_("police-report.pdf", "accidentReport")]);
    renderPage();

    const documentsRow = screen.getByTestId("review-document-count").closest("section");
    expect(documentsRow).not.toBeNull();
    expect(documentsRow?.textContent).not.toContain("Austin, TX");
    expect(screen.getByText("Austin, TX").closest("section")?.textContent).not.toContain("document");
  });

  it("opens the evidence screen to manage documents, and marks the visit", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: messages.IntakeReview.editDocuments }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toMatch(/^\/en\/intake\/evidence\?manage=.+/);
  });

  it("marks each visit differently, so a screen the router kept still hears it", () => {
    renderPage();
    const pencil = screen.getByRole("button", { name: messages.IntakeReview.editDocuments });
    vi.setSystemTime(new Date("2026-09-23T00:00:00Z"));
    fireEvent.click(pencil);
    vi.setSystemTime(new Date("2026-09-23T00:00:05Z"));
    fireEvent.click(pencil);

    expect(push.mock.calls[0][0]).not.toBe(push.mock.calls[1][0]);
  });

  it("reflects an edit as soon as the screen is shown again", () => {
    saveDocuments([document_("police-report.pdf", "accidentReport")]);
    const first = renderPage();
    expect(count()).toBe("1 document added");
    first.unmount();

    // What the evidence screen leaves behind after a delete.
    saveDocuments([]);
    renderPage();
    expect(count()).toBe("No documents added");
  });

  it("submits each document under the category it was filed in", async () => {
    saveDocuments([document_("police-report.pdf", "accidentReport"), document_("licence.jpg", "driversLicense")]);
    // The legacy map is keyed by file name and is stale here; the document's
    // own category is the one that was sent to the upload route, so it wins.
    sessionStorage.setItem(
      "intake_document_categories",
      JSON.stringify({ "police-report.pdf": "insuranceCard", "licence.jpg": "insuranceCard" })
    );
    completeIntake.mockResolvedValueOnce(undefined);

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: messages.IntakeReview.submit }));

    await waitFor(() => expect(completeIntake).toHaveBeenCalledTimes(1));
    const payload = completeIntake.mock.calls[0][0] as { documents: { fileName: string; category?: string }[] };
    expect(payload.documents.map((doc) => [doc.fileName, doc.category])).toEqual([
      ["police-report.pdf", "accidentReport"],
      ["licence.jpg", "driversLicense"],
    ]);
  });

  it("still reads a category from the map for a session written by an earlier build", async () => {
    saveDocuments([
      {
        fileName: "old.pdf",
        storagePath: "sub-1/accidentReport/old-1.pdf",
        mimeType: "application/pdf",
        fileSize: 12,
      },
    ]);
    sessionStorage.setItem("intake_document_categories", JSON.stringify({ "old.pdf": "accidentReport" }));
    completeIntake.mockResolvedValueOnce(undefined);

    renderPage();
    expect(screen.getByTestId("review-document")).toHaveTextContent(messages.IntakeEvidence.category.accidentReport);

    fireEvent.click(screen.getByRole("button", { name: messages.IntakeReview.submit }));
    await waitFor(() => expect(completeIntake).toHaveBeenCalledTimes(1));
    const payload = completeIntake.mock.calls[0][0] as { documents: { category?: string }[] };
    expect(payload.documents[0].category).toBe("accidentReport");
  });

  describe("what each row shows", () => {
    const image = document_("crash.jpg", "incidentPhotos");
    const licence = document_("licence.png", "driversLicense");
    const policy = document_("policy.pdf", "insuranceCard");

    it("draws the uploaded picture beside an image document", () => {
      saveDocuments([image]);
      savePreviews({ [image.storagePath]: REAL_WEBP });
      renderPage();

      const row = rowFor("crash.jpg");
      const thumbnail = within(row).getByRole("img");
      expect(thumbnail).toHaveAttribute("src", REAL_WEBP);
      // Named by what it is a picture of, not by "image".
      expect(thumbnail).toHaveAccessibleName(`${messages.IntakeEvidence.category.incidentPhotos} preview`);
      expect(row).toHaveTextContent("crash.jpg");
      expect(row).toHaveTextContent(messages.IntakeEvidence.category.incidentPhotos);
    });

    it("draws a document rather than a picture for a PDF", () => {
      saveDocuments([policy]);
      savePreviews({});
      renderPage();

      const row = rowFor("policy.pdf");
      expect(within(row).queryByRole("img")).not.toBeInTheDocument();
      // The glyph is decoration; the name and the category carry the meaning.
      expect(row.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      expect(row).toHaveTextContent("policy.pdf");
      expect(row).toHaveTextContent(messages.IntakeEvidence.category.insuranceCard);
    });

    it("still draws a PDF as a document even if a thumbnail is cached against it", () => {
      // The kind of the document decides, not whether a preview happens to
      // exist for its key — a stale entry must not turn a policy into a photo.
      saveDocuments([policy]);
      savePreviews({ [policy.storagePath]: REAL_WEBP });
      renderPage();

      const row = rowFor("policy.pdf");
      expect(within(row).queryByRole("img")).not.toBeInTheDocument();
      expect(row.querySelector("svg")).toBeInTheDocument();
    });

    it("falls back to the document glyph when a thumbnail cannot be drawn", () => {
      saveDocuments([image]);
      savePreviews({ [image.storagePath]: "data:image/webp;base64,not-really-an-image" });
      renderPage();

      const row = rowFor("crash.jpg");
      fireEvent.error(within(row).getByRole("img"));

      expect(within(row).queryByRole("img")).not.toBeInTheDocument();
      expect(row.querySelector("svg")).toBeInTheDocument();
      // A picture that will not draw changes nothing about the case.
      expect(row).toHaveTextContent("crash.jpg");
      expect(row).toHaveTextContent(messages.IntakeEvidence.category.incidentPhotos);
      expect(count()).toBe("1 document added");
    });

    it("keeps a long file name on one line", () => {
      const long = document_(
        "WhatsApp Image 2026-07-04 at 16.54.12 from the scene of the accident.jpeg",
        "incidentPhotos"
      );
      saveDocuments([long]);
      savePreviews({ [long.storagePath]: REAL_WEBP });
      renderPage();

      const name = screen.getByTitle(long.fileName);
      expect(name.className).toContain("truncate");
      // Truncation only works if the column is allowed to be narrower than its
      // content, which is what min-w-0 buys.
      expect(name.parentElement?.className).toContain("min-w-0");
      expect(within(rowFor(long.fileName)).getByRole("img")).toBeInTheDocument();
    });

    it("gives every document its own picture and its own category", () => {
      saveDocuments([image, licence, policy]);
      savePreviews({ [image.storagePath]: REAL_WEBP, [licence.storagePath]: REAL_WEBP });
      renderPage();

      expect(count()).toBe("3 documents added");
      expect(documentImages()).toHaveLength(2);
      expect(within(rowFor("crash.jpg")).getByRole("img")).toHaveAccessibleName(
        `${messages.IntakeEvidence.category.incidentPhotos} preview`
      );
      expect(within(rowFor("licence.png")).getByRole("img")).toHaveAccessibleName(
        `${messages.IntakeEvidence.category.driversLicense} preview`
      );
      expect(within(rowFor("policy.pdf")).queryByRole("img")).not.toBeInTheDocument();
    });

    it("shows the same pictures again after the screen is reopened", () => {
      saveDocuments([image, policy]);
      savePreviews({ [image.storagePath]: REAL_WEBP });
      const first = renderPage();
      expect(documentImages()).toHaveLength(1);
      first.unmount();

      renderPage();
      expect(within(rowFor("crash.jpg")).getByRole("img")).toHaveAttribute("src", REAL_WEBP);
      expect(count()).toBe("2 documents added");
    });

    it("drops the row, the picture and the count together when a document goes", () => {
      saveDocuments([image, policy]);
      savePreviews({ [image.storagePath]: REAL_WEBP });
      const first = renderPage();
      expect(count()).toBe("2 documents added");
      first.unmount();

      // What the evidence screen leaves behind after deleting the photo.
      saveDocuments([policy]);
      savePreviews({});
      renderPage();

      expect(count()).toBe("1 document added");
      expect(screen.queryByTitle("crash.jpg")).not.toBeInTheDocument();
      expect(documentImages()).toHaveLength(0);
    });

    it("names the picture in Spanish too", () => {
      saveDocuments([image]);
      savePreviews({ [image.storagePath]: REAL_WEBP });
      cleanup();
      render(
        <NextIntlClientProvider
          locale="es"
          messages={spanish}
        >
          <IntakeReviewPage />
        </NextIntlClientProvider>
      );

      expect(documentImages()[0]).toHaveAccessibleName(
        `Vista previa de ${spanish.IntakeEvidence.category.incidentPhotos}`
      );
    });
  });
});
