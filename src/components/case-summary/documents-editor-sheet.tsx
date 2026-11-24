"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { DocumentThumbnail } from "@/components/intake/document-thumbnail";
import { convertImageToWebp } from "@/hooks/use-supabase-upload";
import { formatBytes } from "@/lib/format-bytes";
import { createPreviewThumbnail } from "@/lib/preview-thumbnail";
import { uploadToSignedUrl } from "@/lib/signed-upload";
import {
  CATEGORY_ACCEPT,
  DOCUMENT_ACCEPT,
  acceptsDocuments,
  pickerAttributesFor,
  sourcesForCategory,
  type UploadSource,
} from "@/lib/upload-source";
import { createDocumentUploadUrl } from "@/services/intake";
import { EVIDENCE_CATEGORY_VALUES, isEvidenceCategory, type EvidenceCategory } from "@/types/intake";

/** A document already on the case, as GET /case/:submissionId lists it. */
export interface CaseDocument {
  id: string;
  fileName: string;
  mimeType: string;
  category?: string | null;
}

/** A file uploaded from Case Summary, recorded on the case only when the patient saves. */
export interface AddedDocument {
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  category: EvidenceCategory;
  preview?: string;
}

// The evidence screen's limits (intake/evidence/page.tsx).
const MAX_FILES = 8;
const MAX_FILE_SIZE = 1000 * 1000 * 25;

const SOURCE_LABEL_KEYS: Record<UploadSource, "takePhoto" | "choosePhotos" | "chooseDocument"> = {
  camera: "takePhoto",
  photos: "choosePhotos",
  document: "chooseDocument",
};

/** The same-origin route that reads one of the patient's own files for its thumbnail. */
export const documentFileUrl = (submissionId: string, documentId: string) =>
  `/api/case/${encodeURIComponent(submissionId)}/documents/${encodeURIComponent(documentId)}`;

function accepted(category: EvidenceCategory, file: File): boolean {
  return CATEGORY_ACCEPT[category].some((type) =>
    type === "image/*" ? file.type.startsWith("image/") : file.type === type
  );
}

interface DocumentsEditorSheetProps {
  submissionId: string;
  /** The case's documents still kept in the draft. */
  kept: CaseDocument[];
  added: AddedDocument[];
  onSave: (kept: CaseDocument[], added: AddedDocument[]) => void;
  onCancel: () => void;
  /** Every object this sheet uploads, so the screen can delete the ones that are never saved. */
  onUploaded: (storagePath: string) => void;
}

export function DocumentsEditorSheet({
  submissionId,
  kept: initialKept,
  added: initialAdded,
  onSave,
  onCancel,
  onUploaded,
}: DocumentsEditorSheetProps) {
  const t = useTranslations("CaseSummary");
  const tReview = useTranslations("IntakeReview");
  const tEvidence = useTranslations("IntakeEvidence");
  const [kept, setKept] = useState(initialKept);
  const [added, setAdded] = useState(initialAdded);
  const [step, setStep] = useState<"list" | "category" | "source">("list");
  const [category, setCategory] = useState<EvidenceCategory | null>(null);
  const [uploading, setUploading] = useState<string[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [picker, setPicker] = useState<{ accept: string; capture?: "environment" }>({ accept: "image/*" });

  const busy = uploading.length > 0;
  const total = kept.length + added.length;

  const chooseSource = (source: UploadSource) => {
    if (!category) return;
    setPicker(pickerAttributesFor(category, source));
    setStep("list");
    // the input is configured before it opens, as on the evidence screen
    requestAnimationFrame(() => inputRef.current?.click());
  };

  const uploadOne = async (file: File, into: EvidenceCategory): Promise<AddedDocument> => {
    const prepared = await convertImageToWebp(file).catch(() => file);
    const { bucket, storagePath, token } = await createDocumentUploadUrl({
      submissionId,
      fileName: prepared.name,
      category: into,
    });
    onUploaded(storagePath);
    await uploadToSignedUrl({ bucket, storagePath, token, file: prepared });
    let preview: string | undefined;
    if (prepared.type.startsWith("image/")) {
      const objectUrl = URL.createObjectURL(prepared);
      preview = (await createPreviewThumbnail(objectUrl)) ?? undefined;
      URL.revokeObjectURL(objectUrl);
    }
    return {
      storagePath,
      fileName: prepared.name,
      mimeType: prepared.type || DOCUMENT_ACCEPT,
      fileSize: prepared.size,
      category: into,
      preview,
    };
  };

  const handleFiles = async (list: FileList | null) => {
    const into = category;
    if (!list || !into) return;
    const files = Array.from(list);
    const found: string[] = [];
    if (files.length > MAX_FILES) {
      found.push(tEvidence("tooManyFiles", { max: MAX_FILES, count: files.length - MAX_FILES }));
    }
    const ready = files.slice(0, MAX_FILES).filter((file) => {
      if (!accepted(into, file)) {
        found.push(
          `${file.name}: ${acceptsDocuments(into) ? tEvidence("rejectedTypeImageOrPdf") : tEvidence("rejectedTypeImage")}`
        );
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        found.push(
          `${file.name}: ${tEvidence("fileTooLarge", { size: formatBytes(file.size, 1), max: formatBytes(MAX_FILE_SIZE, 0) })}`
        );
        return false;
      }
      return true;
    });
    setProblems(found);
    if (ready.length === 0) return;

    setUploading(ready.map((file) => file.name));
    const results = await Promise.allSettled(ready.map((file) => uploadOne(file, into)));
    const uploaded = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    const failed = ready.filter((_, index) => results[index]?.status === "rejected");
    setAdded((current) => [...current, ...uploaded]);
    if (failed.length > 0) {
      setProblems((current) => [...current, ...failed.map((file) => `${file.name}: ${t("uploadFailed")}`)]);
    }
    setUploading([]);
  };

  const categoryLabel = (value: string | null | undefined) =>
    isEvidenceCategory(value) ? tEvidence(`category.${value}`) : "";
  const row = "flex items-center gap-[12px]";
  const nameClass = "truncate text-[14px] leading-[20px] text-black";
  const subClass = "truncate text-[12px] leading-[16px] text-[#6e6e73]";
  const font = { fontFamily: "var(--font-inter)" } as const;

  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/35">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="documents-editor-title"
        className="max-h-[85dvh] w-full overflow-y-auto rounded-t-[20px] bg-white px-[20px] pb-[24px] pt-[12px]"
      >
        <div className="mx-auto mb-[12px] h-[4px] w-[44px] rounded-full bg-[#d1d1d6]" />
        <h2
          id="documents-editor-title"
          className="mb-[16px] text-center text-[20px] font-extrabold text-black"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {step === "category"
            ? tEvidence("categoryHeading")
            : step === "source" && category
              ? tEvidence("sourceSheetTitle", { category: categoryLabel(category) })
              : t("editDocumentsTitle")}
        </h2>

        {/* the file input stays mounted, configured for the chosen category and source */}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          data-testid="case-document-input"
          accept={picker.accept}
          {...(picker.capture ? { capture: picker.capture } : {})}
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />

        {step === "category" && (
          <div className="flex flex-col gap-[10px]">
            {EVIDENCE_CATEGORY_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setCategory(value);
                  setStep("source");
                }}
                className="h-[52px] w-full rounded-[12px] border border-[#e5e5ea] px-[16px] text-left text-[15px] font-semibold text-black"
                style={font}
              >
                {tEvidence(`category.${value}`)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setStep("list")}
              className="mt-[6px] h-[24px] text-center text-[14px] font-semibold text-[#6E6E73] underline"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {tReview("cancel")}
            </button>
          </div>
        )}

        {step === "source" && category && (
          <div className="flex flex-col gap-[10px]">
            {sourcesForCategory(category).map((source) => (
              <button
                key={source}
                type="button"
                onClick={() => chooseSource(source)}
                className="h-[52px] w-full rounded-[12px] border border-[#e5e5ea] px-[16px] text-left text-[15px] font-semibold text-black"
                style={font}
              >
                {tEvidence(`source.${SOURCE_LABEL_KEYS[source]}`)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setStep("category")}
              className="mt-[6px] h-[24px] text-center text-[14px] font-semibold text-[#6E6E73] underline"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {tReview("cancel")}
            </button>
          </div>
        )}

        {step === "list" && (
          <>
            <ul className="flex flex-col gap-[12px]">
              {total === 0 && !busy && (
                <li
                  className="text-center text-[14px] text-[#6e6e73]"
                  style={font}
                >
                  {t("noDocuments")}
                </li>
              )}
              {kept.map((doc) => {
                const docCategory = isEvidenceCategory(doc.category) ? doc.category : null;
                return (
                  <li
                    key={doc.id}
                    data-testid="document-row"
                    className={row}
                  >
                    <DocumentThumbnail
                      document={{ fileName: doc.fileName, mimeType: doc.mimeType, storagePath: doc.id, fileSize: 0 }}
                      preview={documentFileUrl(submissionId, doc.id)}
                      category={docCategory}
                    />
                    <span
                      className="flex min-w-0 flex-1 flex-col"
                      style={font}
                    >
                      <span className={nameClass}>{doc.fileName}</span>
                      {docCategory && <span className={subClass}>{categoryLabel(docCategory)}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => setKept((current) => current.filter((entry) => entry.id !== doc.id))}
                      aria-label={tEvidence("removeFile", { fileName: doc.fileName })}
                      className="inline-flex size-[32px] items-center justify-center text-[#111828]"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                );
              })}
              {added.map((doc) => (
                <li
                  key={doc.storagePath}
                  data-testid="document-row"
                  className={row}
                >
                  <DocumentThumbnail
                    document={{
                      fileName: doc.fileName,
                      mimeType: doc.mimeType,
                      storagePath: doc.storagePath,
                      fileSize: doc.fileSize,
                    }}
                    preview={doc.preview}
                    category={doc.category}
                  />
                  <span
                    className="flex min-w-0 flex-1 flex-col"
                    style={font}
                  >
                    <span className={nameClass}>{doc.fileName}</span>
                    <span className={subClass}>
                      {categoryLabel(doc.category)} · {formatBytes(doc.fileSize, 1)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setAdded((current) => current.filter((entry) => entry.storagePath !== doc.storagePath))
                    }
                    aria-label={tEvidence("removeFile", { fileName: doc.fileName })}
                    className="inline-flex size-[32px] items-center justify-center text-[#111828]"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
              {uploading.map((name) => (
                <li
                  key={`uploading-${name}`}
                  className={row}
                  style={font}
                >
                  <span className="size-[40px] shrink-0 animate-pulse rounded-[10px] bg-[#f2f2f7]" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={nameClass}>{name}</span>
                    <span className={subClass}>{tEvidence("uploadingFile")}</span>
                  </span>
                </li>
              ))}
            </ul>

            {problems.length > 0 && (
              <ul
                role="alert"
                className="mt-[12px] flex flex-col gap-[4px] text-[12px] text-[#cc007e]"
                style={font}
              >
                {problems.map((problem, index) => (
                  <li key={`${problem}-${index}`}>{problem}</li>
                ))}
              </ul>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setProblems([]);
                setStep("category");
              }}
              className="mt-[16px] flex h-[50px] w-full items-center justify-center gap-[10px] rounded-[16px] border border-[#e5e5ea] bg-white text-[15px] font-bold text-black disabled:opacity-50"
              style={font}
            >
              <Plus
                size={16}
                className="text-[#cc007e]"
              />
              <span>{t("addDocument")}</span>
            </button>

            <div className="mt-[16px] flex flex-col gap-[8px]">
              <button
                type="button"
                disabled={busy}
                onClick={() => onSave(kept, added)}
                className={`h-[56px] w-full rounded-[16px] text-[16px] font-semibold ${
                  busy ? "bg-[#e5e5e5] text-[#8c8c8c]" : "bg-brand text-white"
                }`}
                style={{ fontFamily: "var(--font-nunito-sans)" }}
              >
                {tReview("saveChanges")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onCancel}
                className="h-[24px] text-center text-[14px] font-semibold text-[#6E6E73] underline"
                style={{ fontFamily: "var(--font-nunito-sans)" }}
              >
                {tReview("cancel")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
