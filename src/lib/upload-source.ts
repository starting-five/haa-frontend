import type { EvidenceCategory } from "@/types/intake";

// Where a file comes from, and how the browser is asked for it.
//
// The patient picks a category, then picks a source once. Each source maps to
// exactly one native destination, which is the whole point: the app's sheet
// exists to configure the file input before it is opened, not to duplicate a
// chooser the platform already shows.
//
// What the platforms actually do with `<input type="file">`, which is what the
// table below is built around:
//
//   accept image + capture   iOS: camera        Android: camera
//   accept image, no capture iOS: system sheet  Android: photo picker, images only
//   accept application/pdf   iOS: Files         Android: document picker, PDFs only
//
// Two consequences worth keeping in mind:
//
//   * iOS has no way to ask for the photo library directly — an image input
//     without `capture` always raises Apple's own sheet (Take Photo / Photo
//     Library / Browse). That sheet is the platform's, and it is why the app's
//     sheet must not repeat the same three choices after a source is chosen.
//   * an accept list that mixes media with non-media types is mishandled on
//     iOS, where PDFs then cannot be selected at all. Every list below is
//     therefore media-only or document-only, never both.

export const UPLOAD_SOURCE_VALUES = ["camera", "photos", "document"] as const;

export type UploadSource = (typeof UPLOAD_SOURCE_VALUES)[number];

export const IMAGE_ACCEPT = "image/*";
export const DOCUMENT_ACCEPT = "application/pdf";

/**
 * What each category accepts. This is the validation contract — the source only
 * decides which native destination opens, never what the case may hold.
 *
 * Video is deliberately absent, and the screen no longer mentions it: the
 * bucket, the 25 MB limit and the retention story were sized for stills, so
 * enabling it is a product decision rather than a MIME-type edit. The picker
 * filters videos out, and one that gets past it (a desktop file browser set to
 * "all files") is refused as any other type the category does not take.
 */
export const CATEGORY_ACCEPT: Record<EvidenceCategory, readonly string[]> = {
  accidentReport: [IMAGE_ACCEPT, DOCUMENT_ACCEPT],
  incidentPhotos: [IMAGE_ACCEPT],
  insuranceCard: [IMAGE_ACCEPT, DOCUMENT_ACCEPT],
  driversLicense: [IMAGE_ACCEPT, DOCUMENT_ACCEPT],
};

export function acceptsDocuments(category: EvidenceCategory): boolean {
  return CATEGORY_ACCEPT[category].includes(DOCUMENT_ACCEPT);
}

/**
 * The sources offered for a category.
 *
 * A category that holds no documents does not offer "choose a document": the
 * option would open a picker whose every result the category then refuses.
 */
export function sourcesForCategory(category: EvidenceCategory): UploadSource[] {
  return acceptsDocuments(category) ? ["camera", "photos", "document"] : ["camera", "photos"];
}

export interface PickerAttributes {
  accept: string;
  capture?: "environment";
}

/** How the file input is configured for one (category, source) pair. */
export function pickerAttributesFor(category: EvidenceCategory, source: UploadSource): PickerAttributes {
  if (source === "document") {
    return { accept: DOCUMENT_ACCEPT };
  }

  const images = CATEGORY_ACCEPT[category].filter((type) => type !== DOCUMENT_ACCEPT).join(",") || IMAGE_ACCEPT;
  return source === "camera" ? { accept: images, capture: "environment" } : { accept: images };
}

// ── the state the screen is in ───────────────────────────────────────────────
//
// idle        the category list; nothing is being uploaded
// choosing    the app's source sheet is open for one category
// picking     a source was chosen and the native picker was opened
// browsing    the picker handed files over; they upload into that category
//             and are shown on its card in the list
//
// A picker closed without a file goes back to idle, so a cancelled camera
// leaves the patient where they started rather than on an empty screen.
//
// The upload itself (validating, uploading, persisted) belongs to the upload
// hook and the saved set; duplicating it here would create a second version of
// the truth that could disagree with the first.

export type UploadSourceState =
  | { status: "idle" }
  | { status: "choosing"; category: EvidenceCategory }
  | { status: "picking"; category: EvidenceCategory; source: UploadSource }
  | { status: "browsing"; category: EvidenceCategory; source: UploadSource };

export type UploadSourceEvent =
  | { type: "category-opened"; category: EvidenceCategory }
  | { type: "source-chosen"; source: UploadSource }
  | { type: "sheet-dismissed" }
  | { type: "files-selected" }
  | { type: "picker-cancelled" }
  | { type: "category-closed" };

export const initialUploadSourceState: UploadSourceState = { status: "idle" };

/**
 * The one place the sheet can be opened is a tap on a category.
 *
 * Nothing that happens afterwards — files arriving, the picker being
 * dismissed, a re-render, an upload finishing — can put the machine back into
 * `choosing`, which is what stops the sheet reappearing behind the native
 * picker. Events that do not apply to the current state are ignored rather
 * than throwing: they are races, not programming errors.
 */
export function uploadSourceReducer(state: UploadSourceState, event: UploadSourceEvent): UploadSourceState {
  switch (event.type) {
    case "category-opened":
      return { status: "choosing", category: event.category };

    case "source-chosen":
      return state.status === "choosing"
        ? { status: "picking", category: state.category, source: event.source }
        : state;

    case "sheet-dismissed":
      return state.status === "choosing" ? { status: "idle" } : state;

    case "files-selected":
      return state.status === "picking"
        ? { status: "browsing", category: state.category, source: state.source }
        : state;

    // Cancellation is inferred from the window regaining focus with the input
    // still empty, which can arrive late. It is honoured only while the picker
    // is the thing that is open: a files-selected that already moved the screen
    // on must not be undone by it.
    case "picker-cancelled":
      return state.status === "picking" ? { status: "idle" } : state;

    case "category-closed":
      return { status: "idle" };

    default:
      return state;
  }
}

/** The category being worked on, if any. */
export function activeCategory(state: UploadSourceState): EvidenceCategory | null {
  return state.status === "idle" ? null : state.category;
}
