import { beforeEach, describe, expect, it } from "vitest";

import {
  addDocuments,
  documentsToRecord,
  categoryOf,
  countByCategory,
  countIntakeDocuments,
  DOCUMENTS_STORAGE_KEY,
  DOCUMENT_CATEGORIES_STORAGE_KEY,
  DOCUMENT_PREVIEWS_STORAGE_KEY,
  documentsForSubmission,
  documentsInCategory,
  readIntakeDocuments,
  removeDocument,
  savePreview,
} from "@/lib/intake-documents";
import type { UploadedFile } from "@/types/intake";

// The saved set is the only record of what the patient has attached between
// the upload finishing and /intake/complete writing document rows. Counting it
// wrong shows a number no one can explain; trimming it wrong leaves an object
// in the bucket with nothing pointing at it, or a row pointing at an object
// that is gone.

const doc = (fileName: string, path: string, extra: Partial<UploadedFile> = {}): UploadedFile => ({
  fileName,
  storagePath: path,
  mimeType: "application/pdf",
  fileSize: 1024,
  ...extra,
});

const storage = () => sessionStorage;

const saved = () => readIntakeDocuments(storage());

beforeEach(() => {
  sessionStorage.clear();
});

describe("recording uploads", () => {
  it("records a document under the category it was filed in", () => {
    addDocuments(storage(), [doc("report.pdf", "sub-1/accidentReport/report-a1.pdf")], "accidentReport");

    const state = saved();
    expect(state.documents).toHaveLength(1);
    expect(state.documents[0].category).toBe("accidentReport");
    expect(categoryOf(state.documents[0], state.categories)).toBe("accidentReport");
  });

  it("does not rewrite a document it already holds", () => {
    const path = "sub-1/accidentReport/report-a1.pdf";
    addDocuments(storage(), [doc("report.pdf", path, { fileSize: 4096 })], "accidentReport");
    // The evidence screen re-seeds its working list from the saved set as empty
    // placeholders; letting one of those win is how recorded sizes became 0.
    addDocuments(storage(), [doc("report.pdf", path, { fileSize: 0 })], "accidentReport");

    expect(saved().documents).toHaveLength(1);
    expect(saved().documents[0].fileSize).toBe(4096);
  });

  it("keeps two files that share a name but not an object key", () => {
    addDocuments(storage(), [doc("photo.jpg", "sub-1/incidentPhotos/photo-a1.jpg")], "incidentPhotos");
    addDocuments(storage(), [doc("photo.jpg", "sub-1/incidentPhotos/photo-b2.jpg")], "incidentPhotos");

    expect(saved().documents).toHaveLength(2);
    expect(countIntakeDocuments(storage(), "sub-1")).toBe(2);
  });

  it("reads a category written by an earlier build, which only had the map", () => {
    sessionStorage.setItem(
      DOCUMENTS_STORAGE_KEY,
      JSON.stringify([{ fileName: "card.pdf", storagePath: "sub-1/x/card.pdf", mimeType: "", fileSize: 1 }])
    );
    sessionStorage.setItem(DOCUMENT_CATEGORIES_STORAGE_KEY, JSON.stringify({ "card.pdf": "insuranceCard" }));

    const state = saved();
    expect(categoryOf(state.documents[0], state.categories)).toBe("insuranceCard");
  });

  it("refuses to read a category that is not one of ours", () => {
    sessionStorage.setItem(
      DOCUMENTS_STORAGE_KEY,
      JSON.stringify([{ fileName: "x.pdf", storagePath: "sub-1/x/x.pdf", category: "../../etc", fileSize: 1 }])
    );
    const state = saved();
    expect(categoryOf(state.documents[0], state.categories)).toBeNull();
    expect(countByCategory(state.documents, state.categories)).toEqual({});
  });
});

describe("removing a document", () => {
  const seed = () => {
    addDocuments(storage(), [doc("a.pdf", "sub-1/accidentReport/a-1.pdf")], "accidentReport");
    addDocuments(storage(), [doc("b.pdf", "sub-1/accidentReport/b-2.pdf")], "accidentReport");
  };

  it("takes the document, its category and its preview with it", () => {
    seed();
    savePreview(storage(), "sub-1/accidentReport/a-1.pdf", "data:image/webp;base64,AA");

    removeDocument(storage(), "sub-1/accidentReport/a-1.pdf");

    const state = saved();
    expect(state.documents.map((entry) => entry.fileName)).toEqual(["b.pdf"]);
    expect(state.categories["sub-1/accidentReport/a-1.pdf"]).toBeUndefined();
    expect(state.categories["a.pdf"]).toBeUndefined();
    expect(state.previews["sub-1/accidentReport/a-1.pdf"]).toBeUndefined();
    expect(JSON.parse(sessionStorage.getItem(DOCUMENT_PREVIEWS_STORAGE_KEY) ?? "{}")).toEqual({});
  });

  it("keeps the file-name key while another document still answers to it", () => {
    addDocuments(storage(), [doc("photo.jpg", "sub-1/incidentPhotos/photo-a1.jpg")], "incidentPhotos");
    addDocuments(storage(), [doc("photo.jpg", "sub-1/incidentPhotos/photo-b2.jpg")], "incidentPhotos");

    removeDocument(storage(), "sub-1/incidentPhotos/photo-a1.jpg");

    expect(saved().categories["photo.jpg"]).toBe("incidentPhotos");
  });

  it("does nothing at all for a key it does not hold", () => {
    seed();
    const before = sessionStorage.getItem(DOCUMENTS_STORAGE_KEY);
    removeDocument(storage(), "sub-1/accidentReport/never-uploaded.pdf");
    expect(sessionStorage.getItem(DOCUMENTS_STORAGE_KEY)).toBe(before);
  });
});

describe("counting what the case will submit", () => {
  it("counts only this submission's documents", () => {
    addDocuments(storage(), [doc("mine.pdf", "sub-2/accidentReport/mine-1.pdf")], "accidentReport");
    // left behind by an earlier intake in the same tab — the backend rejects a
    // foreign object key at submit, so counting it would promise a document the
    // case cannot have
    addDocuments(storage(), [doc("theirs.pdf", "sub-1/accidentReport/theirs-1.pdf")], "accidentReport");

    expect(countIntakeDocuments(storage(), "sub-2")).toBe(1);
    expect(documentsForSubmission(saved().documents, "sub-2").map((entry) => entry.fileName)).toEqual(["mine.pdf"]);
  });

  it("groups by category for the screen that shows them", () => {
    addDocuments(storage(), [doc("report.pdf", "sub-1/accidentReport/r-1.pdf")], "accidentReport");
    addDocuments(storage(), [doc("card.pdf", "sub-1/insuranceCard/c-1.pdf")], "insuranceCard");
    addDocuments(storage(), [doc("card2.pdf", "sub-1/insuranceCard/c-2.pdf")], "insuranceCard");

    const state = saved();
    expect(countByCategory(state.documents, state.categories)).toEqual({ accidentReport: 1, insuranceCard: 2 });
    expect(documentsInCategory(state.documents, state.categories, "insuranceCard").map((e) => e.fileName)).toEqual([
      "card.pdf",
      "card2.pdf",
    ]);
  });

  it("survives a corrupt value rather than taking the screen down with it", () => {
    sessionStorage.setItem(DOCUMENTS_STORAGE_KEY, "{not json");
    sessionStorage.setItem(DOCUMENT_CATEGORIES_STORAGE_KEY, "also not json");
    expect(saved()).toEqual({ documents: [], categories: {}, previews: {} });
    expect(countIntakeDocuments(storage(), "sub-1")).toBe(0);
  });

  it("ignores entries that are not documents", () => {
    sessionStorage.setItem(DOCUMENTS_STORAGE_KEY, JSON.stringify([null, 7, { fileName: "no path" }]));
    expect(saved().documents).toEqual([]);
  });
});

describe("turning a finished round into records", () => {
  const file = (name: string, storagePath?: string, size = 1024, type = "image/jpeg") => ({
    name,
    type,
    size,
    storagePath,
  });

  it("records a file the component holds and the backend gave a key", () => {
    const records = documentsToRecord(
      [file("crash.jpg", "sub-1/incidentPhotos/crash-a1.jpg", 2048, "image/webp")],
      ["crash.jpg"],
      "incidentPhotos"
    );

    expect(records).toEqual([
      {
        fileName: "crash.jpg",
        storagePath: "sub-1/incidentPhotos/crash-a1.jpg",
        mimeType: "image/webp",
        fileSize: 2048,
        category: "incidentPhotos",
      },
    ]);
  });

  it("ignores a success with no file behind it", () => {
    // This is what wrote the phantom: the name survived in `successes` with no
    // file left to describe it, and the record came out as a zero-byte entry
    // with no MIME type, pointing at a key that had just been deleted.
    expect(documentsToRecord([], ["ghost.jpg"], "accidentReport")).toEqual([]);
    expect(
      documentsToRecord(
        [file("real.jpg", "sub-1/accidentReport/real-a1.jpg")],
        ["real.jpg", "ghost.jpg"],
        "accidentReport"
      )
    ).toHaveLength(1);
  });

  it("never invents an object key", () => {
    // The backend adds a random suffix so two uploads of one name stay apart,
    // so `submissionId/category/name` is not a key that exists.
    expect(documentsToRecord([file("no-key.jpg", undefined)], ["no-key.jpg"], "accidentReport")).toEqual([]);
  });

  it("uses the key the upload route returned when the file has not got one yet", () => {
    const records = documentsToRecord([file("late.jpg", undefined)], ["late.jpg"], "driversLicense", {
      knownPaths: { "late.jpg": "sub-1/driversLicense/late-b2.jpg" },
    });
    expect(records[0].storagePath).toBe("sub-1/driversLicense/late-b2.jpg");
  });

  it("refuses to rebuild a record for a key this round deleted", () => {
    const gone = "sub-1/accidentReport/report-a1.pdf";
    const records = documentsToRecord([file("report.pdf", gone)], ["report.pdf"], "accidentReport", {
      deleted: new Set([gone]),
    });
    expect(records).toEqual([]);
  });

  it("leaves files that have not finished uploading alone", () => {
    expect(
      documentsToRecord([file("pending.jpg", "sub-1/incidentPhotos/pending-a1.jpg")], [], "incidentPhotos")
    ).toEqual([]);
  });

  it("records one document per object key, never two", () => {
    const key = "sub-1/incidentPhotos/photo-a1.jpg";
    const records = documentsToRecord(
      [file("photo.jpg", key), file("photo.jpg", key)],
      ["photo.jpg"],
      "incidentPhotos"
    );
    expect(records).toHaveLength(1);
  });
});
