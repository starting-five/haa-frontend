import { isEvidenceCategory, type EvidenceCategory, type UploadedFile } from "@/types/intake";

// The patient's evidence, before the case is submitted.
//
// Storage objects exist from the moment a file uploads, but `documents` rows
// are only written by POST /intake/complete. Between those two points the saved
// set below is the record of what the patient has attached: the evidence screen
// draws from it, the review screen counts it, and it is what the submit payload
// sends. Every screen therefore has to read and write it the same way, which is
// why this lives in one module rather than being re-implemented per page.
//
// Two rules the module exists to enforce, both learned the hard way:
//
//   * it only grows through a completed upload and only shrinks through a
//     delete the backend has confirmed. Nothing else may rewrite an entry —
//     re-deriving it from transient UI state is what once replaced real file
//     sizes with 0 and made deleted files reappear on the next screen.
//   * an entry that does not belong to the submission being filled in is not
//     part of that case. The backend rejects a foreign object key at submit
//     (403 document_outside_submission), so a stale record from an earlier
//     intake in the same tab would otherwise fail the whole submission.

export const DOCUMENTS_STORAGE_KEY = "intake_documents";
export const DOCUMENT_CATEGORIES_STORAGE_KEY = "intake_document_categories";
export const DOCUMENT_PREVIEWS_STORAGE_KEY = "intake_document_previews";

/** The saved set plus the two side tables that hang off it. */
export interface IntakeDocumentsState {
  documents: UploadedFile[];
  categories: Record<string, string>;
  previews: Record<string, string>;
}

function readJson<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    return parsed === null || typeof parsed !== "object" ? fallback : (parsed as T);
  } catch {
    // A corrupt value is treated as no value: the alternative is a screen that
    // cannot render at all, and the objects are still in Storage either way.
    return fallback;
  }
}

export function readDocuments(storage: Storage): UploadedFile[] {
  const parsed = readJson<UploadedFile[]>(storage, DOCUMENTS_STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (doc): doc is UploadedFile =>
      Boolean(doc) && typeof doc.storagePath === "string" && typeof doc.fileName === "string"
  );
}

export function readCategories(storage: Storage): Record<string, string> {
  return readJson<Record<string, string>>(storage, DOCUMENT_CATEGORIES_STORAGE_KEY, {});
}

export function readPreviews(storage: Storage): Record<string, string> {
  return readJson<Record<string, string>>(storage, DOCUMENT_PREVIEWS_STORAGE_KEY, {});
}

export function readIntakeDocuments(storage: Storage): IntakeDocumentsState {
  return {
    documents: readDocuments(storage),
    categories: readCategories(storage),
    previews: readPreviews(storage),
  };
}

function writeState(storage: Storage, state: IntakeDocumentsState): IntakeDocumentsState {
  storage.setItem(DOCUMENTS_STORAGE_KEY, JSON.stringify(state.documents));
  storage.setItem(DOCUMENT_CATEGORIES_STORAGE_KEY, JSON.stringify(state.categories));
  storage.setItem(DOCUMENT_PREVIEWS_STORAGE_KEY, JSON.stringify(state.previews));
  return state;
}

// ── what kind of thing a document is ─────────────────────────────────────────
//
// Records written before the upload hook recorded MIME types carry an empty
// `mimeType`, so the name is the fallback. Nothing here reads the object
// itself: a patient's session cannot, and asking would be a network round trip
// per row on a screen that only wants to draw an icon.

const IMAGE_EXTENSIONS: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
};

const EXTENSIONS: Record<string, string> = {
  ...IMAGE_EXTENSIONS,
  pdf: "application/pdf",
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
};

export function resolveMimeType(document: UploadedFile): string {
  if (document.mimeType) return document.mimeType;
  const extension = document.fileName.split(".").pop()?.toLowerCase();
  return (extension && EXTENSIONS[extension]) || "application/octet-stream";
}

export type DocumentKind = "image" | "pdf" | "video" | "other";

/** What to draw for a document when there is no picture of it to show. */
export function documentKind(document: UploadedFile): DocumentKind {
  const type = resolveMimeType(document);
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type === "application/pdf") return "pdf";
  return "other";
}

export function isImageDocument(document: UploadedFile): boolean {
  return documentKind(document) === "image";
}

/**
 * Which category a document was filed under.
 *
 * The document carries its own category since the upload route started
 * recording it; the map is the older representation and is still consulted so
 * a session that began on an earlier build keeps its categories. It is keyed
 * by object key and, for the same reason, by file name.
 */
export function categoryOf(document: UploadedFile, categories: Record<string, string>): EvidenceCategory | null {
  const candidate = document.category ?? categories[document.storagePath] ?? categories[document.fileName];
  return isEvidenceCategory(candidate) ? candidate : null;
}

/**
 * Only the documents that belong to this submission.
 *
 * The object key the backend mints always begins with the submission id, so a
 * record from an earlier intake in the same tab is recognisable without asking
 * the server.
 */
export function documentsForSubmission(documents: UploadedFile[], submissionId: string): UploadedFile[] {
  if (!submissionId) return documents;
  return documents.filter((document) => document.storagePath.startsWith(`${submissionId}/`));
}

export function documentsInCategory(
  documents: UploadedFile[],
  categories: Record<string, string>,
  category: EvidenceCategory
): UploadedFile[] {
  return documents.filter((document) => categoryOf(document, categories) === category);
}

export function countByCategory(
  documents: UploadedFile[],
  categories: Record<string, string>
): Record<EvidenceCategory, number> {
  const counts = {} as Record<EvidenceCategory, number>;
  for (const document of documents) {
    const category = categoryOf(document, categories);
    if (category) counts[category] = (counts[category] ?? 0) + 1;
  }
  return counts;
}

/** A file the upload component is holding, as far as persistence cares. */
export interface UploadCandidate {
  name: string;
  type: string;
  size: number;
  storagePath?: string;
}

/**
 * Turns a finished round into records.
 *
 * A document is only a document when the component still holds the file *and*
 * the backend has given it an object key. Neither half may be guessed:
 *
 *   * a name left in `successes` with no file behind it is not evidence of
 *     anything. Building a record from one wrote `fileSize: 0` and
 *     `mimeType: ""` — and, because the key was taken from a lookup that
 *     outlives the round, it pointed at an object that had just been deleted.
 *     The patient saw a row with no thumbnail and no size that they could not
 *     get rid of, and the case would have submitted a row for a file that was
 *     no longer in the bucket.
 *   * an object key is never composed here. The backend adds a random suffix
 *     to keep two uploads of one name apart, so `submissionId/category/name`
 *     is not a key that exists — it just looks like one.
 *
 * `deleted` holds the keys this round has already removed from Storage, so an
 * entry cannot come back however the state updates happen to interleave.
 */
export function documentsToRecord(
  files: readonly UploadCandidate[],
  successes: readonly string[],
  category: EvidenceCategory,
  options: { knownPaths?: Readonly<Record<string, string>>; deleted?: ReadonlySet<string> } = {}
): UploadedFile[] {
  const succeeded = new Set(successes);
  const records: UploadedFile[] = [];

  for (const file of files) {
    if (!succeeded.has(file.name)) continue;

    const storagePath = file.storagePath ?? options.knownPaths?.[file.name];
    if (!storagePath) continue;
    if (options.deleted?.has(storagePath)) continue;
    if (records.some((record) => record.storagePath === storagePath)) continue;

    records.push({
      fileName: file.name,
      storagePath,
      mimeType: file.type,
      fileSize: file.size,
      category,
    });
  }

  return records;
}

/**
 * Records uploads that have finished, under the category they were filed in.
 *
 * Add-only by object key: a document already recorded keeps the entry it was
 * saved with. The working list the evidence screen shows can hold the same file
 * as an empty placeholder rehydrated from this set, and letting that win is how
 * recorded file sizes were once overwritten with 0.
 */
export function addDocuments(
  storage: Storage,
  incoming: UploadedFile[],
  category: EvidenceCategory
): IntakeDocumentsState {
  const state = readIntakeDocuments(storage);
  const known = new Set(state.documents.map((document) => document.storagePath));
  const added = incoming.filter((document) => !known.has(document.storagePath));
  if (added.length === 0) return state;

  const documents = [...state.documents, ...added.map((document) => ({ ...document, category }))];
  const categories = { ...state.categories };
  for (const document of added) {
    // both keys, so a session written by an earlier build still resolves
    categories[document.storagePath] = category;
    categories[document.fileName] = category;
  }

  return writeState(storage, { ...state, documents, categories });
}

/**
 * Removes a document the backend has confirmed is gone from Storage.
 *
 * Call it only after the delete request has resolved: dropping the record first
 * leaves the object in the bucket with nothing pointing at it if the request
 * then fails.
 */
export function removeDocument(storage: Storage, storagePath: string): IntakeDocumentsState {
  const state = readIntakeDocuments(storage);
  const removed = state.documents.find((document) => document.storagePath === storagePath);
  if (!removed) return state;

  const documents = state.documents.filter((document) => document.storagePath !== storagePath);
  const categories = { ...state.categories };
  delete categories[storagePath];
  // the file-name key is shared by every document with that name, so it only
  // goes once the last of them has
  if (!documents.some((document) => document.fileName === removed.fileName)) {
    delete categories[removed.fileName];
  }

  const previews = { ...state.previews };
  delete previews[storagePath];

  return writeState(storage, { documents, categories, previews });
}

export function savePreview(storage: Storage, storagePath: string, preview: string): IntakeDocumentsState {
  const state = readIntakeDocuments(storage);
  if (state.previews[storagePath] === preview) return state;
  return writeState(storage, { ...state, previews: { ...state.previews, [storagePath]: preview } });
}

/**
 * The number of documents the case will be submitted with.
 *
 * Counted from the saved set, scoped to this submission — never from the upload
 * component's working list, which holds files that are still uploading, files
 * that failed, and placeholders for documents it rehydrated.
 */
export function countIntakeDocuments(storage: Storage, submissionId: string): number {
  return documentsForSubmission(readDocuments(storage), submissionId).length;
}
