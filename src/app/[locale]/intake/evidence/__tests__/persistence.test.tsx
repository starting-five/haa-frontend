import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en.json";
import type { UploadedFile } from "@/types/intake";

// The saved set in sessionStorage ("intake_documents") is what the review
// screen counts and what /intake/complete records, so these tests drive the
// page with the real upload hook — only the backend services and the Storage
// client are mocked — and assert what lands there.
// The sibling page.test.tsx mocks the hook, which is exactly how a delete that
// trimmed the working list but not the saved set passed CI.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/intake/evidence",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/hooks/use-require-session-key", () => ({ useRequireSessionKey: () => {} }));
vi.mock("next/image", () => ({
  default: () => <span data-testid="next-image" />,
}));

const uploadToSignedUrl = vi.fn<(path: string, token: string, file: File) => Promise<{ error: unknown }>>();
const createSignedUrl = vi.fn(async () => ({ data: null, error: { message: "Object not found" } }));
vi.mock("@/lib/supabase/client", async () => {
  const { headerOnlySupabaseClient } = await import("@/test-utils/supabase-client-mock");
  const header = headerOnlySupabaseClient().createClient();
  return {
    createClient: () => ({
      ...header,
      storage: { from: () => ({ uploadToSignedUrl, createSignedUrl }) },
    }),
  };
});

// Mirrors the backend: the object key is unique per upload, so a retry or a
// same-named file never lands on an earlier key.
let keyCounter = 0;
const createDocumentUploadUrl = vi.fn(async ({ fileName, category }: { fileName: string; category?: string }) => {
  keyCounter += 1;
  const dot = fileName.lastIndexOf(".");
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : "";
  return { storagePath: `sub-1/${category}/${stem}-${keyCounter.toString(16).padStart(8, "0")}${ext}`, token: "tok" };
});
const deleteDocument = vi.fn(async (_payload: { submissionId: string; storagePath: string }) => {});
// The hook sends files through lib/signed-upload's transport; it is routed to
// the storage stub above so these tests keep observing every upload there.
vi.mock("@/lib/signed-upload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/signed-upload")>();
  return {
    ...actual,
    uploadToSignedUrl: async ({ storagePath, token, file }: { storagePath: string; token: string; file: File }) => {
      const { error } = (await uploadToSignedUrl(storagePath, token, file)) as { error: unknown };
      // Storage answered with an error: nothing was written.
      if (error) throw new actual.UploadRequestError((error as { message?: string }).message ?? "Upload failed", true);
    },
  };
});

vi.mock("@/services/intake", () => ({
  createDocumentUploadUrl: (payload: { fileName: string; category?: string }) => createDocumentUploadUrl(payload),
  deleteDocument: (payload: { submissionId: string; storagePath: string }) => deleteDocument(payload),
}));

import EvidencePage from "../page";

const renderPage = () =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
    >
      <EvidencePage />
    </NextIntlClientProvider>
  );

const savedDocuments = () => JSON.parse(sessionStorage.getItem("intake_documents") ?? "[]") as UploadedFile[];
const savedNames = () => savedDocuments().map((doc) => doc.fileName);

// PDFs on purpose: an image would go through the canvas re-encode, which
// never settles in jsdom. The bookkeeping under test is the same either way.
const pdf = (name: string, size = 4) =>
  new File([new Uint8Array(size)], name, { type: "application/pdf", lastModified: 1 });

const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]');

const pick = async (...files: File[]) => {
  const input = fileInput();
  if (!input) throw new Error("no file input on the evidence screen");
  await act(async () => {
    fireEvent.change(input, { target: { files } });
  });
};

// A category with saved documents carries its count in its accessible name,
// so match on the label's prefix rather than the whole name.
const categoryButton = (category: keyof typeof messages.IntakeEvidence.category) =>
  screen.getByRole("button", { name: (name) => name.startsWith(messages.IntakeEvidence.category[category]) });

const openCategoryList = () => fireEvent.click(screen.getByRole("button", { name: messages.IntakeEvidence.continue }));

// Each pick is its own round: the card, the sheet, then the document picker.
const addDocumentTo = (category: keyof typeof messages.IntakeEvidence.category = "accidentReport") => {
  fireEvent.click(categoryButton(category));
  fireEvent.click(screen.getByRole("button", { name: messages.IntakeEvidence.source.chooseDocument }));
};

const reachUploadStep = (category: keyof typeof messages.IntakeEvidence.category = "accidentReport") => {
  openCategoryList();
  addDocumentTo(category);
};

const waitForSaved = (names: string[]) => waitFor(() => expect(savedNames().sort()).toEqual([...names].sort()));

const rowFor = (fileName: string) => {
  const title = screen.getByTitle(fileName);
  const row = title.closest("li");
  if (!(row instanceof HTMLElement)) throw new Error(`no row for ${fileName}`);
  return row;
};

const label = (template: string, fileName: string) => template.replace("{fileName}", fileName);

// An attached document is deleted; a file that never went up is removed.
const deleteFile = async (fileName: string) => {
  await act(async () => {
    fireEvent.click(
      within(rowFor(fileName)).getByRole("button", { name: label(messages.IntakeEvidence.deleteFile, fileName) })
    );
  });
};

const removeFile = async (fileName: string) => {
  await act(async () => {
    fireEvent.click(
      within(rowFor(fileName)).getByRole("button", { name: label(messages.IntakeEvidence.removeFile, fileName) })
    );
  });
};

const pathOf = (fileName: string) => {
  const doc = savedDocuments().find((entry) => entry.fileName === fileName);
  if (!doc) throw new Error(`${fileName} is not saved`);
  return doc.storagePath;
};

describe("evidence persistence with the real upload hook", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("intake_submissionId", "sub-1");
    keyCounter = 0;
    push.mockReset();
    createDocumentUploadUrl.mockClear();
    deleteDocument.mockClear();
    uploadToSignedUrl.mockReset();
    uploadToSignedUrl.mockResolvedValue({ error: null });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:preview", revokeObjectURL: () => {} }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("A: upload A, upload B, delete A — the next screen gets B only", async () => {
    renderPage();
    reachUploadStep();

    await pick(pdf("a.pdf"));
    await waitForSaved(["a.pdf"]);
    addDocumentTo("accidentReport");
    await pick(pdf("b.pdf"));
    await waitForSaved(["a.pdf", "b.pdf"]);
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(2);

    const pathA = pathOf("a.pdf");
    const pathB = pathOf("b.pdf");
    await deleteFile("a.pdf");

    await waitForSaved(["b.pdf"]);
    // Storage: exactly the deleted object, never its neighbour.
    expect(deleteDocument).toHaveBeenCalledTimes(1);
    expect(deleteDocument).toHaveBeenCalledWith({ submissionId: "sub-1", storagePath: pathA });
    expect(savedDocuments()[0].storagePath).toBe(pathB);
    // The category map follows the document out.
    const categories = JSON.parse(sessionStorage.getItem("intake_document_categories") ?? "{}") as Record<
      string,
      string
    >;
    expect(categories[pathA]).toBeUndefined();
    expect(categories["a.pdf"]).toBeUndefined();
    expect(categories[pathB]).toBe("accidentReport");

    // The card agrees with the saved set.
    expect(screen.queryByTitle("a.pdf")).not.toBeInTheDocument();
    expect(screen.getByTitle("b.pdf")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: messages.IntakeEvidence.continueAfterSelect }));
    expect(push).toHaveBeenCalledWith("/en/intake/review");
    expect(savedNames()).toEqual(["b.pdf"]);
    // The delete did not trigger a re-upload of what remained.
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(2);
  });

  it("B: upload A, delete A — the next screen gets nothing", async () => {
    renderPage();
    reachUploadStep();

    await pick(pdf("a.pdf"));
    await waitForSaved(["a.pdf"]);
    await deleteFile("a.pdf");
    await waitForSaved([]);

    // With nothing attached any more there is no Continue to press; the way on
    // is back to the intro and "Do this later".
    expect(screen.queryByRole("button", { name: messages.IntakeEvidence.continueAfterSelect })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: messages.IntakeEvidence.cancel }));
    fireEvent.click(screen.getByRole("button", { name: messages.IntakeEvidence.skip }));
    expect(push).toHaveBeenCalledWith("/en/intake/review");
    expect(savedDocuments()).toEqual([]);
  });

  it("C: upload A, upload B, delete B — the next screen gets A only", async () => {
    renderPage();
    reachUploadStep();

    await pick(pdf("a.pdf"), pdf("b.pdf"));
    await waitForSaved(["a.pdf", "b.pdf"]);
    const pathB = pathOf("b.pdf");

    await deleteFile("b.pdf");
    await waitForSaved(["a.pdf"]);
    expect(deleteDocument).toHaveBeenCalledWith({ submissionId: "sub-1", storagePath: pathB });
    expect(screen.getByTitle("a.pdf")).toBeInTheDocument();
    expect(screen.queryByTitle("b.pdf")).not.toBeInTheDocument();
  });

  it("D: a reload after the delete still shows B only, with its recorded size intact", async () => {
    const first = renderPage();
    reachUploadStep();
    await pick(pdf("a.pdf", 10), pdf("b.pdf", 20));
    await waitForSaved(["a.pdf", "b.pdf"]);
    await deleteFile("a.pdf");
    await waitForSaved(["b.pdf"]);
    expect(savedDocuments()[0].fileSize).toBe(20);
    first.unmount();

    // Same tab, fresh page: the saved set is the only state that survives.
    renderPage();
    openCategoryList();
    await waitFor(() => expect(screen.getByTitle("b.pdf")).toBeInTheDocument());
    expect(screen.queryByTitle("a.pdf")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: messages.IntakeEvidence.continueAfterSelect }));
    expect(push).toHaveBeenCalledWith("/en/intake/review");
    expect(savedNames()).toEqual(["b.pdf"]);
    // Nothing on the way out rewrites the size recorded at upload time.
    expect(savedDocuments()[0].fileSize).toBe(20);
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(2);
  });

  it("does not let a failed delete drop the document anywhere", async () => {
    renderPage();
    reachUploadStep();
    await pick(pdf("a.pdf"), pdf("b.pdf"));
    await waitForSaved(["a.pdf", "b.pdf"]);

    deleteDocument.mockRejectedValueOnce(new Error("Delete request failed with status 500"));
    await deleteFile("a.pdf");

    await waitFor(() => expect(rowFor("a.pdf")).toHaveTextContent(messages.IntakeEvidence.deleteFailed));
    expect(savedNames().sort()).toEqual(["a.pdf", "b.pdf"]);
    expect(screen.getByTitle("a.pdf")).toBeInTheDocument();
    // The neighbour is untouched.
    expect(rowFor("b.pdf")).not.toHaveTextContent(messages.IntakeEvidence.deleteFailed);
  });

  it("F: a failed upload is removed locally and re-picking it uploads a fresh object", async () => {
    renderPage();
    reachUploadStep();

    uploadToSignedUrl.mockResolvedValueOnce({ error: { message: "network" } });
    await pick(pdf("a.pdf"));
    await waitFor(() => expect(rowFor("a.pdf")).toHaveTextContent(messages.IntakeEvidence.uploadFailed));
    expect(savedDocuments()).toEqual([]);

    // Removing a file that never uploaded touches nothing on the backend.
    await removeFile("a.pdf");
    expect(deleteDocument).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTitle("a.pdf")).not.toBeInTheDocument());

    addDocumentTo("accidentReport");
    await pick(pdf("a.pdf"));
    await waitForSaved(["a.pdf"]);
    expect(createDocumentUploadUrl).toHaveBeenCalledTimes(2);
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(2);
  });

  it("G/H: documents with different names in two categories survive each other's delete", async () => {
    renderPage();
    reachUploadStep("accidentReport");
    await pick(pdf("report.pdf"));
    await waitForSaved(["report.pdf"]);

    addDocumentTo("driversLicense");
    await pick(pdf("license.pdf"));
    await waitForSaved(["report.pdf", "license.pdf"]);

    const pathLicense = pathOf("license.pdf");
    await deleteFile("license.pdf");
    await waitForSaved(["report.pdf"]);
    expect(deleteDocument).toHaveBeenCalledTimes(1);
    expect(deleteDocument).toHaveBeenCalledWith({ submissionId: "sub-1", storagePath: pathLicense });

    // Only the report's category is still marked done.
    expect(screen.getByTestId("category-count-accidentReport")).toHaveTextContent("1");
    expect(screen.queryByTestId("category-count-driversLicense")).not.toBeInTheDocument();
  });

  it("keeps saved evidence when the intro's Do this later is chosen", async () => {
    sessionStorage.setItem(
      "intake_documents",
      JSON.stringify([
        { fileName: "a.pdf", storagePath: "sub-1/accidentReport/a-1.pdf", mimeType: "application/pdf", fileSize: 4 },
      ])
    );
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: messages.IntakeEvidence.skip }));
    expect(push).toHaveBeenCalledWith("/en/intake/review");
    expect(savedNames()).toEqual(["a.pdf"]);
  });
});
