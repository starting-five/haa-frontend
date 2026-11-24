"use client";

import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { ScreenHeader } from "@/components/layout/screen-header";
import { ScreenFooter } from "@/components/layout/screen-footer";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { useSupabaseUpload, type UseSupabaseUploadReturn } from "@/hooks/use-supabase-upload";
import { Camera, Check, ChevronRight, FileText, Image as ImageIcon, Loader2, Trash2, X } from "lucide-react";
import Image from "next/image";
import { Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { FileError } from "react-dropzone";
import { createDocumentUploadUrl, deleteDocument } from "@/services/intake";
import { createPreviewThumbnail } from "@/lib/preview-thumbnail";
import type { EvidenceCategory, UploadedFile } from "@/types/intake";
import {
  addDocuments,
  documentsForSubmission,
  documentsToRecord,
  documentsInCategory,
  readIntakeDocuments,
  removeDocument,
  savePreview,
  type IntakeDocumentsState,
} from "@/lib/intake-documents";
import { formatBytes } from "@/lib/format-bytes";
import {
  acceptsDocuments,
  activeCategory,
  CATEGORY_ACCEPT,
  initialUploadSourceState,
  pickerAttributesFor,
  sourcesForCategory,
  uploadSourceReducer,
  type UploadSource,
} from "@/lib/upload-source";
import { DocumentThumbnail } from "@/components/intake/document-thumbnail";

const EMPTY_DOCUMENTS: IntakeDocumentsState = { documents: [], categories: {}, previews: {} };
const MAX_FILES = 8;
const MAX_FILE_SIZE = 1000 * 1000 * 25; // 25MB

type UploadFileWithPreview = UseSupabaseUploadReturn["files"][number];

// Category icons are the design's own image assets, shown in a 40px tile.
const CATEGORY_OPTIONS: { key: EvidenceCategory; icon: string }[] = [
  { key: "accidentReport", icon: "/assets/intake/evidence/report.png" },
  { key: "incidentPhotos", icon: "/assets/intake/evidence/pictures.png" },
  { key: "insuranceCard", icon: "/assets/intake/evidence/insurance.png" },
  { key: "driversLicense", icon: "/assets/intake/evidence/license.png" },
];

const SOURCE_ICONS: Record<UploadSource, typeof FileText> = {
  camera: Camera,
  photos: ImageIcon,
  document: FileText,
};

const SOURCE_LABEL_KEYS: Record<UploadSource, "takePhoto" | "choosePhotos" | "chooseDocument"> = {
  camera: "takePhoto",
  photos: "choosePhotos",
  document: "chooseDocument",
};

/**
 * One screen, three layers: the intro, the category list, and the source sheet
 * a category opens. Choosing a source opens the native picker, and what the
 * patient picks uploads straight into that category's card — there is no
 * separate upload screen to pass through or back out of.
 *
 * The case summary opens this screen to manage documents, and says so with a
 * `manage` token in the URL.
 *
 * It has to be the URL rather than a flag set on the way here: the router keeps
 * a page it has already rendered, so arriving from the summary can restore this
 * screen exactly as it was left — mid-upload, in some category — and a mount
 * effect would never run to correct it. A fresh token on every visit is a
 * signal that reaches a restored screen too.
 */
// Circumference of the 6.5px-radius progress ring.
const RING_LENGTH = 2 * Math.PI * 6.5;

/**
 * The real share of a file sent, where the row's spinner was: a ring that fills
 * with it and the percentage beside it, in the brand magenta. Before the first
 * byte has gone — a photo being re-encoded, its upload URL being minted — it is
 * 0% with a short arc turning, so the row reads as working, not stuck.
 */
function UploadPercent({ percent, preparing, label }: { percent: number; preparing: boolean; label: string }) {
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="-my-[4px] -mr-[8px] flex h-[32px] shrink-0 items-center gap-[4px] pl-[4px] pr-[8px]"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        aria-hidden="true"
        data-phase={preparing ? "preparing" : "sending"}
        className={preparing ? "animate-spin motion-reduce:animate-none" : "-rotate-90"}
      >
        <circle
          cx="8"
          cy="8"
          r="6.5"
          fill="none"
          stroke="#f2f2f7"
          strokeWidth="2"
        />
        <circle
          cx="8"
          cy="8"
          r="6.5"
          fill="none"
          stroke="#cc007e"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={preparing ? RING_LENGTH * 0.75 : RING_LENGTH * (1 - percent / 100)}
          className="transition-[stroke-dashoffset] duration-200 ease-out"
        />
      </svg>
      <span
        className="min-w-[30px] text-right text-[12px] font-semibold leading-[16px] text-[#cc007e] tabular-nums"
        style={{ fontFamily: "var(--font-inter)" }}
      >
        {percent}%
      </span>
    </span>
  );
}

export default function IntakeEvidencePage() {
  return (
    <Suspense fallback={null}>
      <IntakeEvidenceScreen />
    </Suspense>
  );
}

function IntakeEvidenceScreen() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeEvidence");
  const manageToken = useSearchParams().get("manage");

  useRequireSessionKey("intake_treatmentArea", "/intake/treatment-area");

  // The intro is the screen's own first step; everything after it happens on
  // the category list.
  const [introShown, setIntroShown] = useState(true);
  const [returnToReview, setReturnToReview] = useState(false);

  // One state, one set of transitions. The sheet, the chosen source and the
  // category used to be three independent pieces of state, and an effect
  // reopened the picker whenever they lined up again — which they did on every
  // re-render after the picker returned.
  const [sourceState, dispatchSource] = useReducer(uploadSourceReducer, initialUploadSourceState);
  // The category the sheet is open for, and then the one the picked files go
  // into — a round of uploads belongs to exactly one category.
  const category = activeCategory(sourceState);
  const isSheetOpen = sourceState.status === "choosing";

  const [saved, setSaved] = useState<IntakeDocumentsState>(EMPTY_DOCUMENTS);
  // Deletes in flight, and the ones the backend refused, by object key.
  const [removals, setRemovals] = useState<Record<string, "deleting" | "failed">>({});
  // The picked file's own preview, shown on its row until the cached thumbnail
  // has been made; it lives only as long as this screen does.
  const [livePreviews, setLivePreviews] = useState<Record<string, string>>({});
  // mirror for callbacks the upload hook captures at click time — a delete must
  // see the saved set as it is when the backend answers, not as it was when the
  // row was drawn
  const savedRef = useRef(saved);
  savedRef.current = saved;

  // set by otp's startIntake call — guaranteed present by the time this page is reachable
  const submissionId = typeof window !== "undefined" ? (sessionStorage.getItem("intake_submissionId") ?? "") : "";

  // the backend sanitises the file name, so the key it returns is the one to store
  const storagePaths = useRef<Record<string, string>>({});
  // Object keys this screen has already deleted from Storage. The lookup above
  // outlives a round, so without this a record could be rebuilt for a file that
  // is no longer there, whatever order the state updates land in.
  const deletedPaths = useRef<Set<string>>(new Set());
  // Documents recorded during this visit to the category list, by object key.
  // Continue keeps them; Cancel takes them back out (see discardVisit). A visit
  // starts when the list opens — from the intro or from the case summary.
  const visitPaths = useRef<Set<string>>(new Set());
  const hasReadSession = useRef(false);

  const getSignedUpload = useCallback(
    async (file: File) => {
      if (!category) throw new Error("No document category selected");
      const { storagePath, token } = await createDocumentUploadUrl({
        submissionId,
        fileName: file.name,
        category,
      });
      storagePaths.current[file.name] = storagePath;
      return { storagePath, token };
    },
    [submissionId, category]
  );

  // The saved set is what review counts and what /intake/complete records, so a
  // delete has to leave it as well as Storage and the working list — it used to
  // trim only the latter two, and the document came back one screen later. The
  // trim runs after the backend has confirmed the object is gone; a failed
  // delete throws before it and the document stays everywhere.
  const deleteUploadedFile = useCallback(
    async ({ storagePath }: { name: string; storagePath: string }) => {
      await deleteDocument({ submissionId, storagePath });
      // Tombstoned before the record goes, so nothing can put it back.
      deletedPaths.current.add(storagePath);
      if (!savedRef.current.documents.some((doc) => doc.storagePath === storagePath)) return;
      setSaved(removeDocument(sessionStorage, storagePath));
    },
    [submissionId]
  );

  // What this category may hold, which is not what the chosen source opens: the
  // source decides which native destination appears, the category decides what
  // the case accepts. Rejections are described in the patient's language rather
  // than by listing MIME types at them.
  const describeRejection = useCallback(
    (fileError: FileError) => {
      if (fileError.code !== "file-invalid-type") return fileError.message;
      return category && acceptsDocuments(category) ? t("rejectedTypeImageOrPdf") : t("rejectedTypeImage");
    },
    [category, t]
  );

  // Everything the screen shows about what is attached comes from the saved
  // set, scoped to this submission — never from the upload component's working
  // list, which also holds files that are still going up and files that failed.
  const submissionDocuments = useMemo(
    () => documentsForSubmission(saved.documents, submissionId),
    [saved.documents, submissionId]
  );

  // A second `policy.pdf` in a category becomes `policy (2).pdf`, as it would
  // within one round, so the card never lists two rows the patient cannot tell
  // apart. iOS names every camera capture `image.jpg`, which makes this common.
  const namesInCategory = useMemo(
    () =>
      category ? documentsInCategory(submissionDocuments, saved.categories, category).map((doc) => doc.fileName) : [],
    [category, saved.categories, submissionDocuments]
  );

  // What the case accepts for this category. It is deliberately not the accept
  // list the picker is opened with: the source chooses a destination, the
  // category decides what may be attached, and a file that slips past the
  // picker's filter is refused here with a message that says why.
  const allowedMimeTypes = useMemo(
    () => [...(category ? CATEGORY_ACCEPT[category] : CATEGORY_ACCEPT.accidentReport)],
    [category]
  );

  const uploadProps = useSupabaseUpload({
    bucketName: "submissions",
    allowedMimeTypes,
    maxFiles: MAX_FILES,
    maxFileSize: MAX_FILE_SIZE,
    // The backend mints a unique key per upload, so nothing needs replacing.
    upsert: false,
    getSignedUpload,
    deleteUploadedFile,
    getErrorMessage: describeRejection,
    // A picker closed empty-handed returns the patient to the category list.
    onFileDialogCancel: () => dispatchSource({ type: "picker-cancelled" }),
    reservedNames: namesInCategory,
  });
  const { setFiles: setUploadFiles, setSuccesses: setUploadSuccesses, open: openPicker, getInputProps } = uploadProps;

  // `open` clears the input and clicks it; holding it in a ref keeps the copy
  // used after a flushSync the one from the render that flushSync committed.
  const openPickerRef = useRef(openPicker);
  openPickerRef.current = openPicker;
  const resetUploadRef = useRef(uploadProps.reset);
  resetUploadRef.current = uploadProps.reset;

  useEffect(() => {
    if (hasReadSession.current) return;
    hasReadSession.current = true;
    setSaved(readIntakeDocuments(sessionStorage));
  }, []);

  // Opened from the case summary: start on the categories, with whatever the
  // screen was doing before put away, and go back there when done.
  useEffect(() => {
    if (!manageToken) return;
    setReturnToReview(true);
    setIntroShown(false);
    dispatchSource({ type: "category-closed" });
    resetUploadRef.current();
    visitPaths.current = new Set();
  }, [manageToken]);

  // Choosing files in the picker is the patient's "upload" gesture, so a batch
  // goes up as soon as it lands rather than waiting for a second tap. The batch
  // is remembered by its file names so re-renders never send it twice; a file
  // that fails stays on its card, and a new round starts clean.
  const uploadedBatch = useRef("");
  const { files: pickedFiles, loading: uploading, successes, errors: uploadErrors, onUpload } = uploadProps;
  useEffect(() => {
    if (pickedFiles.length === 0) {
      uploadedBatch.current = "";
      return;
    }
    if (uploading) return;
    // Files the category refused wait on the card to be removed; they do not
    // hold back the ones it took.
    const pending = pickedFiles.filter(
      (file) =>
        file.errors.length === 0 && !successes.includes(file.name) && !uploadErrors.some((e) => e.name === file.name)
    );
    if (pending.length === 0) return;
    const batch = pending
      .map((file) => file.name)
      .sort()
      .join("\n");
    if (uploadedBatch.current === batch) return;
    uploadedBatch.current = batch;
    void onUpload();
  }, [pickedFiles, uploading, successes, uploadErrors, onUpload]);

  // Files arriving is what closes the picker, whether they were accepted or
  // rejected. It never reopens the sheet: the machine has no transition back
  // into `choosing` from here.
  const pickedCount = pickedFiles.length;
  useEffect(() => {
    if (pickedCount === 0) return;
    dispatchSource({ type: "files-selected" });
  }, [pickedCount]);

  const buildCurrentCategoryDocuments = useCallback(
    (forCategory: EvidenceCategory): UploadedFile[] =>
      documentsToRecord(uploadProps.files, uploadProps.successes, forCategory, {
        knownPaths: storagePaths.current,
        deleted: deletedPaths.current,
      }),
    [uploadProps.files, uploadProps.successes]
  );

  // The thumbnail kept beside a record is made from the picked file, because
  // the bucket cannot be read back (see DocumentThumbnail). It starts when the
  // record is made and is not tied to a render, so moving on to another
  // category straight after an upload cannot cancel it.
  const cacheThumbnails = useCallback((records: UploadedFile[], files: readonly UploadFileWithPreview[]) => {
    for (const record of records) {
      const source = files.find((file) => file.storagePath === record.storagePath);
      if (!source?.type.startsWith("image/") || typeof source.preview !== "string") continue;
      const preview = source.preview;
      setLivePreviews((current) => ({ ...current, [record.storagePath]: preview }));
      if (savedRef.current.previews[record.storagePath]) continue;
      void createPreviewThumbnail(preview).then((thumbnail) => {
        if (!thumbnail || deletedPaths.current.has(record.storagePath)) return;
        setSaved(savePreview(sessionStorage, record.storagePath, thumbnail));
      });
    }
  }, []);

  /**
   * Folds this round's finished uploads into the saved set.
   *
   * The bytes are already in Storage by the time this runs, so anything not
   * recorded here becomes an object with no document row — evidence the patient
   * believes they attached and no one will ever see. It runs as soon as a batch
   * lands, and again on every path that ends the round.
   *
   * It only ever adds. Removal is the delete's job, once the backend has
   * confirmed it.
   */
  const persistCurrentUploads = useCallback(() => {
    if (!category) return;

    const known = new Set(savedRef.current.documents.map((doc) => doc.storagePath));
    const fresh = buildCurrentCategoryDocuments(category).filter((doc) => !known.has(doc.storagePath));
    if (fresh.length === 0) return;

    setSaved(addDocuments(sessionStorage, fresh, category));
    for (const doc of fresh) visitPaths.current.add(doc.storagePath);
    cacheThumbnails(fresh, uploadProps.files);
  }, [buildCurrentCategoryDocuments, cacheThumbnails, category, uploadProps.files]);

  // Once a batch has landed its files are recorded and leave the working list,
  // so from then on the card draws them from the saved set like any other
  // document. Files that failed stay behind, on the card, until removed.
  useEffect(() => {
    if (uploading || successes.length === 0) return;
    persistCurrentUploads();
    setUploadFiles((current) => current.filter((file) => !successes.includes(file.name)));
    setUploadSuccesses([]);
  }, [persistCurrentUploads, setUploadFiles, setUploadSuccesses, successes, uploading]);

  // What is left of the round is what the card shows under its saved
  // documents: files still going up, files the upload refused, and files the
  // category would not take.
  const failedUploads = new Set(uploadErrors.map((entry) => entry.name));
  const savedPaths = new Set(submissionDocuments.map((doc) => doc.storagePath));
  const statusOf = (file: UploadFileWithPreview) => {
    if (file.errors.length > 0) return "rejected";
    if (failedUploads.has(file.name)) return "failed";
    // uploaded and recorded — the saved row stands for it from here
    if (successes.includes(file.name) && file.storagePath && savedPaths.has(file.storagePath)) return "done";
    return "uploading";
  };
  const roundBusy = uploading || pickedFiles.some((file) => statusOf(file) === "uploading");
  const deleting = Object.values(removals).includes("deleting");
  const busy = roundBusy || deleting;
  const overLimit = pickedFiles.filter((file) => file.errors.some((e) => e.code === "too-many-files")).length;

  // A saved document is deleted from Storage first; the record goes only once
  // the backend has confirmed it (see deleteUploadedFile).
  const deleteSavedDocument = async (doc: UploadedFile) => {
    setRemovals((current) => ({ ...current, [doc.storagePath]: "deleting" }));
    try {
      await deleteUploadedFile({ name: doc.fileName, storagePath: doc.storagePath });
      setRemovals((current) => {
        const next = { ...current };
        delete next[doc.storagePath];
        return next;
      });
    } catch {
      setRemovals((current) => ({ ...current, [doc.storagePath]: "failed" }));
    }
  };

  const rejectionMessage = (file: UploadFileWithPreview) =>
    file.errors
      .filter((e) => e.code !== "too-many-files")
      .map((e) =>
        e.code === "file-too-large"
          ? t("fileTooLarge", { size: formatBytes(file.size, 1), max: formatBytes(MAX_FILE_SIZE, 0) })
          : e.message
      )
      .join(" ");

  const saveEvidenceAndContinue = () => {
    // Continue is not offered while anything is in flight; this is the backstop.
    if (busy) return;
    persistCurrentUploads();
    // what this visit attached is the patient's now
    visitPaths.current = new Set();
    router.push(`/${locale}/intake/review`);
  };

  const handleContinue = () => {
    if (introShown) {
      setIntroShown(false);
      visitPaths.current = new Set();
      return;
    }

    saveEvidenceAndContinue();
  };

  // Ends the round: anything it uploaded is recorded, and the files it could
  // not take are dropped with it — they never reached Storage.
  const closeRound = () => {
    persistCurrentUploads();
    uploadProps.reset();
    dispatchSource({ type: "category-closed" });
  };

  /**
   * Cancel puts the category list back as this visit found it. Uploads still
   * going up are stopped — the hook aborts them and deletes whatever reached
   * Storage regardless. Documents this visit recorded are taken out of the
   * saved set straight away, tombstoned so no late thumbnail or upload can put
   * them back, and deleted from Storage. Documents attached on an earlier visit,
   * one the patient ended with Continue, are not this visit's and stay.
   */
  const discardVisit = () => {
    uploadProps.reset();
    const added = [...visitPaths.current];
    visitPaths.current = new Set();
    for (const storagePath of added) {
      deletedPaths.current.add(storagePath);
      setSaved(removeDocument(sessionStorage, storagePath));
      // Best effort: the record is already gone, so a failed delete leaves an
      // object no document points at — never a document the case would submit.
      void deleteDocument({ submissionId, storagePath }).catch(() => {});
    }
    dispatchSource({ type: "category-closed" });
  };

  const handleSkip = () => {
    if (!introShown) {
      discardVisit();
      if (returnToReview) {
        router.push(`/${locale}/intake/review`);
        return;
      }
      setIntroShown(true);
      return;
    }

    // "Do this later" skips the step; it does not discard evidence. Anything
    // already uploaded is in Storage, and the saved set only shrinks through a
    // confirmed delete — dropping the records here left the objects behind
    // with nothing pointing at them.
    router.push(`/${locale}/intake/review`);
  };

  // Every category asks where the file comes from. A new round cannot start
  // while the last one is still uploading: the files it holds are going into
  // the category it was opened for.
  const openCategory = (next: EvidenceCategory) => {
    if (roundBusy) return;
    closeRound();
    dispatchSource({ type: "category-opened", category: next });
  };

  /**
   * Opens the native picker for the chosen source, in the tap that chose it.
   *
   * Safari only honours a programmatic click on a file input while the gesture
   * that caused it is still on the stack, so this cannot wait for an effect —
   * the previous version scheduled it in a requestAnimationFrame and the click
   * was sometimes ignored, leaving the patient looking at a sheet that seemed
   * to have done nothing. flushSync commits the input carrying this source's
   * accept/capture before the click goes out.
   */
  const selectSource = (source: UploadSource) => {
    flushSync(() => {
      dispatchSource({ type: "source-chosen", source });
    });
    openPickerRef.current?.();
  };

  const title = introShown ? t("heading") : t("categoryHeading");
  // Past the intro, Continue is the way to the case summary, so it is offered
  // only once something is actually attached — a document in the saved set —
  // and not while a file is still going up or being deleted. A file that
  // failed is not attached and does not count.
  const hasUploads = submissionDocuments.length > 0;
  const primaryLabel = introShown ? t("continue") : hasUploads && !busy ? t("continueAfterSelect") : undefined;
  const secondaryLabel = introShown ? t("skip") : t("cancel");
  // The input carries the attributes of the source that is open, and only
  // while it is: camera adds `capture`, the others do not, and no list ever
  // mixes media with documents.
  const activeSource = sourceState.status === "idle" || sourceState.status === "choosing" ? null : sourceState.source;
  const uploadInputProps = category && activeSource ? pickerAttributesFor(category, activeSource) : {};

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      <div className="flex-1 overflow-y-auto px-[24px] pt-[32px]">
        <h1
          className={`text-[28px] font-extrabold leading-[29.12px] text-[#111] ${introShown ? "mb-[8px]" : "mb-[28px]"}`}
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {title}
        </h1>
        {introShown && (
          <>
            {/* Figma 1968:2887 — Subtitle/Regular: Inter 16/1.04 in the subtitle
                grey, in a box that reserves two lines under the heading */}
            <p
              className="min-h-[56px] text-[16px] font-normal leading-[1.04] text-[#5c5c5c]"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {t("subheading")}
            </p>

            {/* Image area — the render sits in a 220px square with the design's
                20px corners, 4px inside its 228px shadow box */}
            <div className="flex items-center justify-center pb-[20px] pt-[29px]">
              <div className="rounded-[24px] p-[4px]">
                <Image
                  src="/assets/intake/haa-device-card-220.webp"
                  alt=""
                  width={440}
                  height={440}
                  priority
                  unoptimized
                  decoding="sync"
                  className="size-[220px] rounded-[20px] object-cover"
                />
              </div>
            </div>
          </>
        )}

        {/* Category list — each card carries what has actually been attached
            to it, read back from the saved set, and under that whatever the
            current round is still doing in it. */}
        {!introShown && (
          <div className="flex flex-col gap-[12px]">
            {CATEGORY_OPTIONS.map(({ key, icon }) => {
              const attached = documentsInCategory(submissionDocuments, saved.categories, key);
              const inRound = key === category ? pickedFiles.filter((file) => statusOf(file) !== "done") : [];
              const label = t(`category.${key}`);

              return (
                <div
                  key={key}
                  className={`overflow-hidden rounded-[16px] border-[0.5px] bg-white ${
                    attached.length > 0 ? "border-[#cc007e]" : "border-[#e5e7eb]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openCategory(key)}
                    disabled={roundBusy}
                    aria-label={
                      attached.length > 0 ? t("categoryWithCount", { category: label, count: attached.length }) : label
                    }
                    className="flex min-h-[60px] w-full items-center gap-[12px] px-[16px] py-[10px] text-left"
                  >
                    <Image
                      src={icon}
                      alt=""
                      width={40}
                      height={40}
                      loading="eager"
                      unoptimized
                      className="size-[40px] shrink-0 rounded-[10px] object-cover"
                    />
                    <p
                      className="flex-1 text-[15px] font-semibold leading-[20px] text-[#1c1c1e]"
                      style={{ fontFamily: "var(--font-nunito-sans)" }}
                    >
                      {label}
                    </p>
                    {attached.length > 0 && (
                      <span
                        data-testid={`category-count-${key}`}
                        aria-hidden="true"
                        className="flex shrink-0 items-center gap-[6px] text-[#cc007e]"
                      >
                        <Check
                          size={18}
                          strokeWidth={2.5}
                        />
                        <span
                          className="text-[14px] font-semibold"
                          style={{ fontFamily: "var(--font-inter)" }}
                        >
                          {attached.length}
                        </span>
                      </span>
                    )}
                  </button>

                  {(attached.length > 0 || inRound.length > 0) && (
                    <ul className="flex flex-col gap-[8px] border-t border-[#f2f2f7] px-[16px] py-[12px]">
                      {attached.map((doc) => {
                        const removal = removals[doc.storagePath];
                        return (
                          <li
                            key={doc.storagePath}
                            data-testid={`category-document-${key}`}
                            className="flex items-center gap-[8px]"
                          >
                            <DocumentThumbnail
                              document={doc}
                              preview={saved.previews[doc.storagePath] ?? livePreviews[doc.storagePath]}
                              category={key}
                              size={24}
                            />
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span
                                title={doc.fileName}
                                className="truncate text-[13px] leading-[18px] text-[#3a3a3c]"
                                style={{ fontFamily: "var(--font-inter)" }}
                              >
                                {doc.fileName}
                              </span>
                              {removal && (
                                <span
                                  role={removal === "failed" ? "alert" : "status"}
                                  className={`text-[12px] leading-[16px] ${
                                    removal === "failed" ? "text-[#cc007e]" : "text-[#8e8e93]"
                                  }`}
                                  style={{ fontFamily: "var(--font-inter)" }}
                                >
                                  {removal === "failed" ? t("deleteFailed") : t("deletingFile")}
                                </span>
                              )}
                            </span>
                            {doc.fileSize > 0 && !removal && (
                              <span
                                className="shrink-0 text-[12px] leading-[18px] text-[#8e8e93]"
                                style={{ fontFamily: "var(--font-inter)" }}
                              >
                                {formatBytes(doc.fileSize, 1)}
                              </span>
                            )}
                            {removal === "deleting" ? (
                              <span className="-my-[4px] -mr-[8px] flex size-[32px] shrink-0 items-center justify-center">
                                <Loader2 className="size-[16px] animate-spin text-[#cc007e]" />
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void deleteSavedDocument(doc)}
                                aria-label={t("deleteFile", { fileName: doc.fileName })}
                                className="-my-[4px] -mr-[8px] flex size-[32px] shrink-0 items-center justify-center text-[#8e8e93]"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </li>
                        );
                      })}

                      {inRound.map((file) => {
                        const status = statusOf(file);
                        // the bytes the browser has sent for this file, once it has started
                        const sent = status === "uploading" ? uploadProps.progress[file.name] : undefined;
                        const message =
                          status === "failed" ? t("uploadFailed") : status === "rejected" ? rejectionMessage(file) : "";
                        return (
                          <li
                            key={file.name}
                            data-testid={`category-upload-${key}`}
                            className="flex items-center gap-[8px]"
                          >
                            <DocumentThumbnail
                              document={{
                                fileName: file.name,
                                storagePath: "",
                                mimeType: file.type,
                                fileSize: file.size,
                                category: key,
                              }}
                              preview={status === "uploading" ? file.preview : undefined}
                              category={key}
                              size={24}
                            />
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span
                                title={file.name}
                                className="truncate text-[13px] leading-[18px] text-[#3a3a3c]"
                                style={{ fontFamily: "var(--font-inter)" }}
                              >
                                {file.name}
                              </span>
                              {status === "uploading" ? (
                                <span
                                  role="status"
                                  className="text-[12px] leading-[16px] text-[#8e8e93]"
                                  style={{ fontFamily: "var(--font-inter)" }}
                                >
                                  {t("uploadingFile")}
                                  {sent?.timeLeft &&
                                    ` · ${
                                      sent.timeLeft.unit === "seconds"
                                        ? t("timeLeftSeconds", { seconds: sent.timeLeft.value })
                                        : t("timeLeftMinutes", { minutes: sent.timeLeft.value })
                                    }`}
                                </span>
                              ) : (
                                message && (
                                  <span
                                    role="alert"
                                    className="text-[12px] leading-[16px] text-[#cc007e]"
                                    style={{ fontFamily: "var(--font-inter)" }}
                                  >
                                    {message}
                                  </span>
                                )
                              )}
                            </span>
                            {status === "uploading" && sent ? (
                              <UploadPercent
                                percent={sent.percent}
                                preparing={!sent.sending}
                                label={t("uploadProgress", { fileName: file.name })}
                              />
                            ) : status === "uploading" ? (
                              // the instant between the pick and the upload being queued
                              <span className="-my-[4px] -mr-[8px] flex size-[32px] shrink-0 items-center justify-center">
                                <Loader2 className="size-[16px] animate-spin text-[#cc007e]" />
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void uploadProps.removeFile(file.name)}
                                aria-label={t("removeFile", { fileName: file.name })}
                                className="-my-[4px] -mr-[8px] flex size-[32px] shrink-0 items-center justify-center text-[#8e8e93]"
                              >
                                <X size={16} />
                              </button>
                            )}
                          </li>
                        );
                      })}

                      {key === category && overLimit > 0 && (
                        <li
                          role="alert"
                          className="text-[12px] leading-[16px] text-[#cc007e]"
                          style={{ fontFamily: "var(--font-inter)" }}
                        >
                          {t("tooManyFiles", { max: MAX_FILES, count: pickedFiles.length - MAX_FILES })}
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* The one file input. The sheet configures it for the chosen source
            and opens it; it has no screen of its own. */}
        <input {...getInputProps(uploadInputProps)} />
      </div>

      <ScreenFooter
        label={primaryLabel}
        onClick={handleContinue}
        secondaryLabel={secondaryLabel}
        onSecondaryClick={handleSkip}
        // Cancel stays available while files upload — it is how they are
        // stopped — but not while a confirmed delete is still on its way.
        secondaryDisabled={deleting}
      />

      {isSheetOpen && category && (
        <div
          className="fixed inset-0 z-30 flex items-end bg-black/35"
          onClick={() => dispatchSource({ type: "sheet-dismissed" })}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("sourceSheetTitle", { category: t(`category.${category}`) })}
            className="w-full rounded-t-[32px] bg-white px-[24px] pt-[12px] shadow-[0_0_5.8px_0_rgba(0,0,0,0.12)]"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 34px)" }}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") dispatchSource({ type: "sheet-dismissed" });
            }}
          >
            <div className="mx-auto mb-[24px] h-[5px] w-[40px] rounded-[2.5px] bg-[#d1d1d6]" />
            {sourcesForCategory(category).map((key, index) => {
              const Icon = SOURCE_ICONS[key];
              return (
                <button
                  key={key}
                  type="button"
                  autoFocus={index === 0}
                  onClick={() => selectSource(key)}
                  className={`flex h-[76px] w-full items-center gap-[16px] text-left ${index > 0 ? "border-t border-[#e5e5ea]" : ""}`}
                >
                  <span className="flex size-[40px] shrink-0 items-center justify-center rounded-[10px] border-[0.5px] border-[#e5e7eb] bg-white text-[#1c1c1e]">
                    <Icon
                      size={20}
                      strokeWidth={2}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      className="text-[18px] font-semibold leading-[24.55px] text-[#1c1c1e]"
                      style={{ fontFamily: "var(--font-nunito-sans)" }}
                    >
                      {t(`source.${SOURCE_LABEL_KEYS[key]}`)}
                    </span>
                  </span>
                  <ChevronRight
                    size={16}
                    className="shrink-0 text-[#c7c7cc]"
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
