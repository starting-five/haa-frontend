import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../messages/en.json";
import { readDocuments } from "@/lib/intake-documents";
import type { UploadedFile } from "@/types/intake";

// Four things have to agree about what the patient has attached: the objects in
// the bucket, the records the case will submit, the category list, and the
// count on the case summary. Every earlier bug in this area was two of them
// disagreeing — a deleted file still counted, a re-seeded row overwriting a
// recorded size, an object left in the bucket with nothing pointing at it.
//
// So the bucket is modelled here rather than stubbed away: the upload route
// hands out keys, the upload puts them in, the delete route takes them out, and
// after every step all four are compared.

const push = vi.fn();
let manageToken: string | null = null;
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/intake/evidence",
  useSearchParams: () => new URLSearchParams(manageToken ? `manage=${manageToken}` : ""),
}));
vi.mock("@/hooks/use-require-session-key", () => ({ useRequireSessionKey: () => {} }));
vi.mock("@/hooks/use-preload-images", () => ({ usePreloadImages: () => {} }));
vi.mock("@/lib/intake-session", () => ({ clearIntakeSessionAfterSubmit: vi.fn() }));
vi.mock("next/image", () => ({ default: () => <span data-testid="next-image" /> }));

/** The bucket. Keys go in on upload and out on a confirmed delete. */
const bucket = new Set<string>();
let keyCounter = 0;

const uploadToSignedUrl = vi.fn(async (path: string) => {
  bucket.add(path);
  return { error: null };
});
const createSignedUrl = vi.fn(async () => ({ data: null, error: { message: "Object not found" } }));
vi.mock("@/lib/supabase/client", async () => {
  const { headerOnlySupabaseClient } = await import("@/test-utils/supabase-client-mock");
  const header = headerOnlySupabaseClient().createClient();
  return {
    createClient: () => ({ ...header, storage: { from: () => ({ uploadToSignedUrl, createSignedUrl }) } }),
  };
});

// Mirrors the backend: the key is built from the submission the server resolved
// and is unique per call, so a retry never lands on an earlier object.
const createDocumentUploadUrl = vi.fn(
  async ({ submissionId, fileName, category }: { submissionId: string; fileName: string; category?: string }) => {
    keyCounter += 1;
    const dot = fileName.lastIndexOf(".");
    const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
    const ext = dot > 0 ? fileName.slice(dot) : "";
    return { storagePath: `${submissionId}/${category}/${stem}-${keyCounter.toString(16)}${ext}`, token: "tok" };
  }
);
const deleteDocument = vi.fn(async ({ submissionId, storagePath }: { submissionId: string; storagePath: string }) => {
  // The backend refuses a key outside the caller's own submission.
  if (!storagePath.startsWith(`${submissionId}/`)) throw new Error("document_outside_submission");
  bucket.delete(storagePath);
});
const completeIntake = vi.fn();
// The hook sends files through lib/signed-upload's transport; it is routed to
// the storage stub above so these tests keep observing every upload there.
vi.mock("@/lib/signed-upload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/signed-upload")>();
  return {
    ...actual,
    uploadToSignedUrl: async ({ storagePath }: { storagePath: string }) => {
      const { error } = (await uploadToSignedUrl(storagePath)) as { error: unknown };
      // Storage answered with an error: nothing was written.
      if (error) throw new actual.UploadRequestError((error as { message?: string }).message ?? "Upload failed", true);
    },
  };
});

vi.mock("@/services/intake", () => ({
  createDocumentUploadUrl: (p: { submissionId: string; fileName: string; category?: string }) =>
    createDocumentUploadUrl(p),
  deleteDocument: (p: { submissionId: string; storagePath: string }) => deleteDocument(p),
  completeIntake: (...args: unknown[]) => completeIntake(...args),
}));

import EvidencePage from "../evidence/page";
import ReviewPage from "../review/page";

const wrap = (node: React.ReactElement) =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={en}
    >
      {node}
    </NextIntlClientProvider>
  );

const pdf = (name: string, size = 8) => new File([new Uint8Array(size)], name, { type: "application/pdf" });

const submissionOf = () => sessionStorage.getItem("intake_submissionId") ?? "";

const savedFor = (submissionId = submissionOf()): UploadedFile[] =>
  readDocuments(sessionStorage).filter((doc) => doc.storagePath.startsWith(`${submissionId}/`));

const bucketFor = (submissionId = submissionOf()) =>
  [...bucket].filter((key) => key.startsWith(`${submissionId}/`)).sort();

const categoryButton = (category: keyof typeof en.IntakeEvidence.category) =>
  screen.getByRole("button", { name: (name) => name.startsWith(en.IntakeEvidence.category[category]) });

const sourceButton = (label: string) => screen.getByRole("button", { name: (name) => name.startsWith(label) });

const openCategory = async (category: keyof typeof en.IntakeEvidence.category) => {
  fireEvent.click(categoryButton(category));
  fireEvent.click(sourceButton(en.IntakeEvidence.source.chooseDocument));
  await act(async () => {});
};

const pick = async (...files: File[]) => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("no file input");
  await act(async () => {
    fireEvent.change(input, { target: { files } });
  });
};

// Attached documents are deleted from their card; there is no upload screen
// to open first.
const deleteFromCard = async (fileName: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: en.IntakeEvidence.deleteFile.replace("{fileName}", fileName) }));
  });
};

/** What the category list is telling the patient, per category. */
const categoryListShows = () =>
  (["accidentReport", "incidentPhotos", "insuranceCard", "driversLicense"] as const).flatMap((key) =>
    screen.queryAllByTestId(`category-document-${key}`).map((n) => n.textContent ?? "")
  );

/** Everything agrees, or this throws naming what did not. */
const expectConsistent = async () => {
  const saved = savedFor();
  expect(saved.map((doc) => doc.storagePath).sort()).toEqual(bucketFor());

  const shown = categoryListShows();
  expect(shown).toHaveLength(saved.length);
  for (const doc of saved) expect(shown.some((row) => row.includes(doc.fileName))).toBe(true);

  // The summary is a separate screen reading the same records.
  const summary = wrap(<ReviewPage />);
  const expected =
    saved.length === 0
      ? "No documents added"
      : saved.length === 1
        ? "1 document added"
        : `${saved.length} documents added`;
  await waitFor(() => expect(screen.getByTestId("review-document-count")).toHaveTextContent(expected));
  expect(screen.queryAllByTestId("review-document")).toHaveLength(saved.length);
  summary.unmount();
};

/** Close the screen and open it again, as a reload or a return would. */
const remountEvidence = async () => {
  cleanup();
  wrap(<EvidencePage />);
  fireEvent.click(screen.getByRole("button", { name: en.IntakeEvidence.continue }));
  await act(async () => {});
};

describe("one canonical document set", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("intake_submissionId", "sub-A");
    sessionStorage.setItem("intake_treatmentArea", "Austin, TX");
    bucket.clear();
    keyCounter = 0;
    manageToken = null;
    push.mockReset();
    completeIntake.mockReset();
    uploadToSignedUrl.mockClear();
    deleteDocument.mockClear();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("stays consistent across the whole upload, delete and revisit sequence", async () => {
    wrap(<EvidencePage />);
    fireEvent.click(screen.getByRole("button", { name: en.IntakeEvidence.continue }));

    // upload
    await openCategory("accidentReport");
    await pick(pdf("report.pdf", 100));
    await waitFor(() => expect(savedFor()).toHaveLength(1));
    await expectConsistent();

    // refresh
    await remountEvidence();
    await expectConsistent();

    // a second document, in a second category
    await openCategory("insuranceCard");
    await pick(pdf("policy.pdf", 200));
    await waitFor(() => expect(savedFor()).toHaveLength(2));
    await expectConsistent();

    // the same file name again, in the same category — a second object, a
    // second record, and a name the patient can tell apart
    await openCategory("insuranceCard");
    await pick(pdf("policy.pdf", 300));
    await waitFor(() => expect(savedFor()).toHaveLength(3));
    expect(new Set(savedFor().map((doc) => doc.storagePath)).size).toBe(3);
    expect(
      savedFor()
        .map((doc) => doc.fileName)
        .sort()
    ).toEqual(["policy (2).pdf", "policy.pdf", "report.pdf"]);
    await expectConsistent();

    // delete the second of them
    await waitFor(() => expect(screen.getByTitle("policy (2).pdf")).toBeInTheDocument());
    expect(screen.getByTitle("policy.pdf")).toBeInTheDocument();
    await deleteFromCard("policy (2).pdf");
    await waitFor(() => expect(savedFor()).toHaveLength(2));
    expect(savedFor().some((doc) => doc.fileName === "policy (2).pdf")).toBe(false);
    await expectConsistent();

    // delete the last one in the category; it goes quiet, the report stays
    await deleteFromCard("policy.pdf");
    await waitFor(() => expect(savedFor()).toHaveLength(1));
    expect(screen.queryByTestId("category-count-insuranceCard")).not.toBeInTheDocument();
    await expectConsistent();

    // and after a remount it is still gone
    await remountEvidence();
    expect(screen.queryByTestId("category-document-insuranceCard")).not.toBeInTheDocument();
    await expectConsistent();
    expect(savedFor().map((doc) => doc.fileName)).toEqual(["report.pdf"]);
    expect(savedFor()[0].fileSize).toBe(100);
  });

  it("does not let a deleted document come back when its category is opened again", async () => {
    wrap(<EvidencePage />);
    fireEvent.click(screen.getByRole("button", { name: en.IntakeEvidence.continue }));
    await openCategory("driversLicense");
    await pick(pdf("licence.pdf"), pdf("spare.pdf"));
    await waitFor(() => expect(savedFor()).toHaveLength(2));

    const gone = savedFor().find((doc) => doc.fileName === "licence.pdf")!.storagePath;
    await deleteFromCard("licence.pdf");
    await waitFor(() => expect(savedFor()).toHaveLength(1));
    expect(bucket.has(gone)).toBe(false);

    // The card is drawn from the saved set. Drawing it from anything else — the
    // previous round, a cached list — is how a deleted file used to walk back
    // in, and opening the category again starts a new round.
    await openCategory("driversLicense");
    await waitFor(() => expect(screen.getByTitle("spare.pdf")).toBeInTheDocument());
    expect(screen.queryByTitle("licence.pdf")).not.toBeInTheDocument();

    // ...and the same after the screen is closed and opened again.
    await remountEvidence();
    await openCategory("driversLicense");
    await waitFor(() => expect(screen.getByTitle("spare.pdf")).toBeInTheDocument());
    expect(screen.queryByTitle("licence.pdf")).not.toBeInTheDocument();
    expect(savedFor().map((doc) => doc.fileName)).toEqual(["spare.pdf"]);
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(2);
  });

  it("changes nothing anywhere when the delete fails", async () => {
    wrap(<EvidencePage />);
    fireEvent.click(screen.getByRole("button", { name: en.IntakeEvidence.continue }));
    await openCategory("accidentReport");
    await pick(pdf("report.pdf"), pdf("exchange.pdf"));
    await waitFor(() => expect(savedFor()).toHaveLength(2));
    const before = bucketFor();

    // The record is only trimmed once the object is gone. Trimming first and
    // asking after would leave an object in the bucket with nothing pointing
    // at it the moment the request failed.
    deleteDocument.mockRejectedValueOnce(new Error("Delete request failed with status 500"));
    await deleteFromCard("report.pdf");
    await waitFor(() => expect(screen.getByText(en.IntakeEvidence.deleteFailed)).toBeInTheDocument());

    expect(bucketFor()).toEqual(before);
    expect(savedFor()).toHaveLength(2);
    await expectConsistent();
  });

  it("ignores records belonging to a different submission", async () => {
    // The same tab, a second intake. The backend rejects a foreign object key at
    // submit, so counting one would promise a document the case cannot carry.
    wrap(<EvidencePage />);
    fireEvent.click(screen.getByRole("button", { name: en.IntakeEvidence.continue }));
    await openCategory("accidentReport");
    await pick(pdf("first-case.pdf"));
    await waitFor(() => expect(savedFor("sub-A")).toHaveLength(1));

    cleanup();
    sessionStorage.setItem("intake_submissionId", "sub-B");
    wrap(<EvidencePage />);
    fireEvent.click(screen.getByRole("button", { name: en.IntakeEvidence.continue }));
    await act(async () => {});

    // The earlier case's document is still in storage and still recorded, but it
    // is not this submission's and is shown and counted nowhere.
    expect(readDocuments(sessionStorage)).toHaveLength(1);
    expect(savedFor("sub-B")).toHaveLength(0);
    expect(screen.queryByTestId("category-document-accidentReport")).not.toBeInTheDocument();
    await expectConsistent();

    // Uploading into the new submission does not disturb the old record.
    await openCategory("accidentReport");
    await pick(pdf("second-case.pdf"));
    await waitFor(() => expect(savedFor("sub-B")).toHaveLength(1));
    await expectConsistent();
    expect(savedFor("sub-A")).toHaveLength(1);
    expect(deleteDocument).not.toHaveBeenCalled();
  });

  it("submits exactly the records the summary counted", async () => {
    wrap(<EvidencePage />);
    fireEvent.click(screen.getByRole("button", { name: en.IntakeEvidence.continue }));
    await openCategory("accidentReport");
    await pick(pdf("report.pdf"));
    await waitFor(() => expect(savedFor()).toHaveLength(1));
    await openCategory("insuranceCard");
    await pick(pdf("policy.pdf"));
    await waitFor(() => expect(savedFor()).toHaveLength(2));
    await deleteFromCard("policy.pdf");
    await waitFor(() => expect(savedFor()).toHaveLength(1));
    cleanup();

    completeIntake.mockResolvedValueOnce(undefined);
    wrap(<ReviewPage />);
    await waitFor(() => expect(screen.getByTestId("review-document-count")).toHaveTextContent("1 document added"));
    fireEvent.click(screen.getByRole("button", { name: en.IntakeReview.submit }));

    await waitFor(() => expect(completeIntake).toHaveBeenCalledTimes(1));
    const payload = completeIntake.mock.calls[0][0] as { documents: { storagePath: string; category?: string }[] };
    expect(payload.documents.map((doc) => doc.storagePath).sort()).toEqual(bucketFor());
    expect(payload.documents[0].category).toBe("accidentReport");
  });
});
