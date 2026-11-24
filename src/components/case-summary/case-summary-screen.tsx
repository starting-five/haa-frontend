"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { ScreenHeader } from "@/components/layout/screen-header";
import { ScreenFooter } from "@/components/layout/screen-footer";
import { DocumentThumbnail } from "@/components/intake/document-thumbnail";
import { AccidentEditorSheet, type AccidentDraft } from "@/components/case-summary/accident-editor-sheet";
import {
  CompanionsEditorSheet,
  cellDigits,
  formatCellNumber,
  type CompanionDraft,
} from "@/components/case-summary/companions-editor-sheet";
import {
  DocumentsEditorSheet,
  documentFileUrl,
  type AddedDocument,
  type CaseDocument,
} from "@/components/case-summary/documents-editor-sheet";
import { InjuriesEditorSheet } from "@/components/case-summary/injuries-editor-sheet";
import { NameEditorSheet } from "@/components/case-summary/name-editor-sheet";
import { RecoveryEditorSheet } from "@/components/case-summary/recovery-editor-sheet";
import { SummarySectionHeader } from "@/components/case-summary/summary-section-header";
import { companionRelationLabelKey } from "@/lib/companion-relations";
import { INJURY_OPTIONS, type InjuryOptionKey } from "@/lib/constants";
import { isEvidenceCategory } from "@/types/intake";
import {
  CaseSummarySaveError,
  deleteDocument,
  saveCaseSummary,
  type CaseSummary,
  type CaseSummaryUpdatePayload,
} from "@/services/intake";
import type { LocationDetails } from "@/types/location";

// The name screen's rule (components/name/name-screen.tsx), which the backend
// enforces too — checked here so the patient hears it in the sheet, not after Save.
const INVALID_NAME_CHARACTERS = /[^a-zA-ZÀ-ÿ\s'\-]/;

interface Draft {
  firstName: string;
  lastName: string;
  accident: AccidentDraft;
  injuries: InjuryOptionKey[];
  // anything the patient typed beside the listed injuries — kept, never shown as editable
  injuryExtras: string[];
  treatmentArea: string;
  treatmentAreaDetails: LocationDetails | null;
  companions: CompanionDraft[];
  // the case's documents the patient keeps, and files uploaded here that Save will record
  keptDocuments: CaseDocument[];
  addedDocuments: AddedDocument[];
}

type OpenSheet = "name" | "accident" | "injuries" | "recovery" | "companions" | "documents" | null;

function splitInjuries(stored: string | null | undefined) {
  const parts = (stored ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    selected: parts.filter((part): part is InjuryOptionKey => INJURY_OPTIONS.includes(part as InjuryOptionKey)),
    extras: parts.filter((part) => !INJURY_OPTIONS.includes(part as InjuryOptionKey)),
  };
}

function draftFrom(summary: CaseSummary): Draft {
  const injuries = splitInjuries(summary.injuries);
  return {
    firstName: summary.firstName,
    lastName: summary.lastName,
    accident: {
      incidentType: summary.incidentType,
      incidentDate: summary.incidentDate ?? "",
      incidentLocation: summary.incidentLocation,
      incidentLocationDetails: summary.incidentLocationDetails ?? null,
      role: summary.role ?? "",
    },
    injuries: injuries.selected,
    injuryExtras: injuries.extras,
    treatmentArea: summary.treatmentArea ?? "",
    treatmentAreaDetails: summary.treatmentAreaLocationDetails ?? null,
    companions: summary.companions.map((person) => ({
      ...(person.id ? { id: person.id } : {}),
      firstName: person.firstName,
      lastName: person.lastName,
      relation: person.relation,
      cellNumber: person.cellNumber ?? "",
      email: person.email ?? "",
    })),
    keptDocuments: summary.documents,
    addedDocuments: [],
  };
}

// a companion as Save sends it — the stored cell format, and no email as null
const companionPayload = (person: CompanionDraft) => ({
  ...(person.id ? { id: person.id } : {}),
  firstName: person.firstName.trim(),
  lastName: person.lastName.trim(),
  relation: person.relation,
  cellNumber: formatCellNumber(cellDigits(person.cellNumber)),
  email: person.email.trim() || null,
});

function localDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

const injuriesValue = (draft: Draft) => [...draft.injuries, ...draft.injuryExtras].join(",");
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Only the sections that differ from what is stored, so an untouched section
 * is never rewritten. Email and phone have no place in it — see the backend's
 * lib/case-summary.ts, which refuses a body that names them.
 */
function changesBetween(saved: Draft, draft: Draft): CaseSummaryUpdatePayload {
  const payload: CaseSummaryUpdatePayload = {};
  if (draft.firstName !== saved.firstName || draft.lastName !== saved.lastName) {
    payload.claimant = { firstName: draft.firstName, lastName: draft.lastName };
  }
  if (!same(draft.accident, saved.accident)) {
    payload.accident = {
      incidentType: draft.accident.incidentType,
      incidentDate: draft.accident.incidentDate,
      incidentLocation: draft.accident.incidentLocation,
      incidentLocationDetails: draft.accident.incidentLocationDetails,
      role: draft.accident.role,
    };
  }
  if (injuriesValue(draft) !== injuriesValue(saved)) payload.injuries = injuriesValue(draft);
  if (draft.treatmentArea !== saved.treatmentArea || !same(draft.treatmentAreaDetails, saved.treatmentAreaDetails)) {
    payload.treatmentArea = draft.treatmentArea;
    payload.treatmentAreaLocationDetails = draft.treatmentAreaDetails;
  }
  if (!same(draft.companions.map(companionPayload), saved.companions.map(companionPayload))) {
    payload.companions = draft.companions.map(companionPayload);
  }
  const keptIds = new Set(draft.keptDocuments.map((doc) => doc.id));
  const removed = saved.keptDocuments.filter((doc) => !keptIds.has(doc.id)).map((doc) => doc.id);
  if (removed.length > 0 || draft.addedDocuments.length > 0) {
    payload.documents = {
      add: draft.addedDocuments.map(({ storagePath, fileName, mimeType, fileSize, category }) => ({
        storagePath,
        fileName,
        mimeType,
        fileSize,
        category,
      })),
      remove: removed,
    };
  }
  return payload;
}

interface CaseSummaryScreenProps {
  locale: string;
  initialSummary: CaseSummary;
}

export function CaseSummaryScreen({ locale, initialSummary }: CaseSummaryScreenProps) {
  const router = useRouter();
  const t = useTranslations("CaseSummary");
  const tReview = useTranslations("IntakeReview");
  const tName = useTranslations("NameScreen");
  const tIncident = useTranslations("IntakeIncident");
  const tRole = useTranslations("IntakeRole");
  const tInjury = useTranslations("IntakeInjury");
  const tCompanion = useTranslations("IntakeWhoWasWithYou");
  const tEvidence = useTranslations("IntakeEvidence");

  const [summary, setSummary] = useState(initialSummary);
  const [draft, setDraft] = useState(() => draftFrom(initialSummary));
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [locked, setLocked] = useState(!initialSummary.editable);
  const [pendingLeave, setPendingLeave] = useState<string | null>(null);
  const unsavedGuardDisabledRef = useRef(false);

  // Files uploaded from the documents sheet. Until Save records them they are
  // only objects in Storage; any the patient discards are deleted again.
  const uploadedPaths = useRef<Set<string>>(new Set());
  const removeUnsavedUploads = useCallback(
    (recorded: AddedDocument[] = []) => {
      const keep = new Set(recorded.map((doc) => doc.storagePath));
      for (const storagePath of uploadedPaths.current) {
        if (keep.has(storagePath)) continue;
        void deleteDocument({ submissionId: summary.submissionId, storagePath }).catch(() => undefined);
      }
      uploadedPaths.current = new Set();
    },
    [summary.submissionId]
  );

  const saved = useMemo(() => draftFrom(summary), [summary]);
  const changes = useMemo(() => changesBetween(saved, draft), [saved, draft]);
  const isDirty = Object.keys(changes).length > 0;
  const dashboardHref = `/${locale}/intake/dashboard`;

  // A fresh read from the server (a later visit, a refresh) becomes the
  // baseline — but never over edits the patient has not saved.
  useEffect(() => {
    if (isDirty || same(initialSummary, summary)) return;
    setSummary(initialSummary);
    setDraft(draftFrom(initialSummary));
    setLocked(!initialSummary.editable);
    // only a new server answer should trigger this, not every edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSummary]);

  // Unsaved edits: the browser asks before a reload or closing the tab, and
  // any in-app link (the header's menu and logo included) asks through the
  // sheet below. Browser Back is not interceptable in the App Router.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (unsavedGuardDisabledRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onLinkClick = (event: MouseEvent) => {
      if (unsavedGuardDisabledRef.current) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingLeave(`${url.pathname}${url.search}${url.hash}`);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onLinkClick, true);
    };
  }, [isDirty]);

  const editDraft = useCallback((update: (current: Draft) => Draft) => {
    unsavedGuardDisabledRef.current = false;
    setDraft(update);
    setSaveError("");
    setOpenSheet(null);
  }, []);

  const discardAndLeave = () => {
    unsavedGuardDisabledRef.current = true;
    const href = pendingLeave ?? dashboardHref;
    // the router can restore this screen with its state on a later visit, so
    // the abandoned edits are dropped here rather than left waiting in it
    removeUnsavedUploads();
    setDraft(draftFrom(summary));
    setPendingLeave(null);
    router.push(href);
  };

  const handleSave = async () => {
    if (saving || locked) return;
    setSaveError("");
    // Save always ends on the dashboard: with nothing changed it simply goes
    // back; with changes it stores them first and goes back once they are kept.
    if (!isDirty) {
      // a file uploaded and then taken out again leaves nothing to save, only an object to delete
      removeUnsavedUploads();
      router.push(dashboardHref);
      return;
    }
    setSaving(true);
    try {
      const stored = await saveCaseSummary(summary.submissionId, changes);
      // what Save recorded stays; uploads the patient removed again are deleted
      removeUnsavedUploads(draft.addedDocuments);
      // stored is the new baseline, so nothing reads as unsaved on the way out
      setSummary(stored);
      setDraft(draftFrom(stored));
      setLocked(!stored.editable);
      unsavedGuardDisabledRef.current = true;
      router.push(dashboardHref);
    } catch (error) {
      if (error instanceof CaseSummarySaveError && error.code === "case_locked") {
        // the backend no longer accepts edits to this case: they cannot be kept, and the screen says why
        setLocked(true);
        removeUnsavedUploads();
        setDraft(draftFrom(summary));
        setSaveError(t("lockedOnSave"));
      } else {
        setSaveError(t("saveError"));
      }
    } finally {
      setSaving(false);
    }
  };

  const editable = !locked;
  // a backend that predates companion editing sends no ids; the list is then shown, not edited
  const companionsEditable =
    editable && summary.companions.every((person) => person.id && person.cellNumber !== undefined);
  // a calendar date, read in the patient's own timezone — new Date("YYYY-MM-DD")
  // is UTC midnight and shows the day before anywhere west of UTC
  const formattedDate = draft.accident.incidentDate
    ? new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(localDate(draft.accident.incidentDate))
    : "";
  const incidentTypeLabel = draft.accident.incidentType
    ? tIncident(`options.${draft.accident.incidentType}` as never)
    : "";
  const roleLabel = draft.accident.role ? tRole(draft.accident.role as never) : "";
  const injuryLabels = [...draft.injuries.map((key) => tInjury(key)), ...draft.injuryExtras];
  const relationLabel = (value: string) => {
    const key = companionRelationLabelKey(value);
    return key ? tCompanion(key) : value;
  };

  const documentRows = [
    ...draft.keptDocuments.map((doc) => ({
      key: doc.id,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      category: doc.category,
      preview: documentFileUrl(summary.submissionId, doc.id),
    })),
    ...draft.addedDocuments.map((doc) => ({
      key: doc.storagePath,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      category: doc.category,
      preview: doc.preview,
    })),
  ];

  const bodyText = "text-[16px] font-normal text-black";
  const bodyStyle = { fontFamily: "var(--font-inter)", fontStyle: "normal", lineHeight: "normal" } as const;

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      <main className="flex-1 overflow-y-auto px-[24px] pt-[32px] pb-[24px]">
        <h1
          className="text-[28px] font-extrabold leading-[1.04] text-black"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>

        {locked && (
          <p
            role="status"
            data-testid="case-summary-locked"
            className="mt-[16px] rounded-[12px] bg-[#f2f2f7] px-[14px] py-[12px] text-[14px] leading-[20px] text-[#3a3a3c]"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {t("lockedNotice")}
          </p>
        )}

        <div className="mt-[24px] flex flex-col gap-[20px]">
          <section className="flex flex-col gap-[8px]">
            <SummarySectionHeader
              title={tReview("aboutTitle")}
              editLabel={tReview("editNameTitle")}
              onEdit={editable ? () => setOpenSheet("name") : undefined}
            />
            <p
              className={bodyText}
              style={bodyStyle}
            >
              {`${draft.firstName} ${draft.lastName}`.trim() || tReview("missing")}
            </p>
            <p
              className={bodyText}
              style={bodyStyle}
            >
              {summary.phone || tReview("missing")}
            </p>
            <p
              className={bodyText}
              style={bodyStyle}
            >
              {summary.email || ""}
            </p>
          </section>

          <div className="h-px w-full bg-[#e5e7eb]" />

          <section className="flex flex-col gap-[8px]">
            <SummarySectionHeader
              title={tReview("accidentTitle")}
              editLabel={tReview("editAccidentTitle")}
              onEdit={editable ? () => setOpenSheet("accident") : undefined}
            />
            <p
              className={bodyText}
              style={bodyStyle}
            >
              {incidentTypeLabel || tReview("missing")}
              {formattedDate ? `, ${formattedDate}` : ""}
            </p>
            <p
              className={bodyText}
              style={bodyStyle}
            >
              {draft.accident.incidentLocation || tReview("missing")}
            </p>
            <p
              className={bodyText}
              style={bodyStyle}
            >
              {roleLabel || tReview("missing")}
            </p>
          </section>

          <div className="h-px w-full bg-[#e5e7eb]" />

          <section className="flex flex-col gap-[8px]">
            <SummarySectionHeader
              title={tReview("companionsTitle")}
              editLabel={t("editCompanionsTitle")}
              onEdit={companionsEditable ? () => setOpenSheet("companions") : undefined}
            />
            {draft.companions.length ? (
              <>
                <div className="flex flex-col gap-[6px]">
                  {draft.companions.map((person, index) => (
                    <p
                      key={`${person.firstName}-${person.relation}-${index}`}
                      className={bodyText}
                      style={bodyStyle}
                    >
                      {`${person.firstName} ${person.lastName}`.trim() || tReview("missing")}
                      {person.relation ? ` · ${relationLabel(person.relation)}` : ""}
                    </p>
                  ))}
                </div>
                <p
                  className="text-[14px] font-normal text-[#4d4d4d]"
                  style={bodyStyle}
                >
                  {tReview("companionsCount", { count: draft.companions.length })}
                </p>
              </>
            ) : (
              <p
                className={bodyText}
                style={bodyStyle}
              >
                {tReview("missing")}
              </p>
            )}
          </section>

          <div className="h-px w-full bg-[#e5e7eb]" />

          <section className="flex flex-col gap-[8px]">
            <SummarySectionHeader
              title={tReview("injuriesTitle")}
              editLabel={tReview("editInjuriesTitle")}
              onEdit={editable ? () => setOpenSheet("injuries") : undefined}
            />
            <p
              className={bodyText}
              style={bodyStyle}
            >
              {injuryLabels.length ? injuryLabels.join(" · ") : tReview("missing")}
            </p>
          </section>

          <div className="h-px w-full bg-[#e5e7eb]" />

          <section className="flex flex-col gap-[8px]">
            <SummarySectionHeader
              title={tReview("recoveryTitle")}
              editLabel={tReview("editRecoveryTitle")}
              onEdit={editable ? () => setOpenSheet("recovery") : undefined}
            />
            <p
              className={bodyText}
              style={bodyStyle}
            >
              {draft.treatmentArea || tReview("missing")}
            </p>
          </section>

          <div className="h-px w-full bg-[#e5e7eb]" />

          <section className="flex flex-col gap-[8px]">
            <SummarySectionHeader
              title={tReview("documentsTitle")}
              editLabel={t("editDocumentsTitle")}
              onEdit={editable ? () => setOpenSheet("documents") : undefined}
            />
            <p
              data-testid="case-summary-document-count"
              className="text-[16px] text-black"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {tReview("documentsCount", { count: documentRows.length })}
            </p>
            {documentRows.length > 0 && (
              <ul className="mt-[4px] flex flex-col gap-[12px]">
                {documentRows.map((doc) => {
                  const category = isEvidenceCategory(doc.category) ? doc.category : null;
                  return (
                    <li
                      key={doc.key}
                      className="flex items-center gap-[12px]"
                    >
                      {/* a stored file is read back through the app's own route; a new one has its upload-time preview */}
                      <DocumentThumbnail
                        document={{ fileName: doc.fileName, mimeType: doc.mimeType, storagePath: doc.key, fileSize: 0 }}
                        preview={doc.preview}
                        category={category}
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span
                          title={doc.fileName}
                          className="truncate text-[14px] leading-[20px] text-black"
                          style={{ fontFamily: "var(--font-inter)" }}
                        >
                          {doc.fileName}
                        </span>
                        {category && (
                          <span
                            className="truncate text-[12px] leading-[16px] text-[#6e6e73]"
                            style={{ fontFamily: "var(--font-inter)" }}
                          >
                            {tEvidence(`category.${category}`)}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </main>

      <ScreenFooter
        label={editable ? (saving ? t("saving") : t("save")) : undefined}
        onClick={() => void handleSave()}
        loading={saving}
        error={saveError}
      />

      {openSheet === "name" && (
        <NameEditorSheet
          initialFirstName={draft.firstName}
          initialLastName={draft.lastName}
          lockedContact={{ phone: summary.phone, email: summary.email ?? "" }}
          validateName={(value) =>
            INVALID_NAME_CHARACTERS.test(value) || value.length > 100 ? tName("invalidName") : null
          }
          onSave={(firstName, lastName) => editDraft((current) => ({ ...current, firstName, lastName }))}
          onCancel={() => setOpenSheet(null)}
        />
      )}

      {openSheet === "accident" && (
        <AccidentEditorSheet
          locale={locale}
          initial={draft.accident}
          onSave={(accident) => editDraft((current) => ({ ...current, accident }))}
          onCancel={() => setOpenSheet(null)}
        />
      )}

      {openSheet === "injuries" && (
        <InjuriesEditorSheet
          initialSelected={draft.injuries}
          onSave={(injuries) => editDraft((current) => ({ ...current, injuries }))}
          onCancel={() => setOpenSheet(null)}
        />
      )}

      {openSheet === "recovery" && (
        <RecoveryEditorSheet
          initialTreatmentArea={draft.treatmentArea}
          initialDetails={draft.treatmentAreaDetails}
          onSave={(treatmentArea, treatmentAreaDetails) =>
            editDraft((current) => ({ ...current, treatmentArea, treatmentAreaDetails }))
          }
          onCancel={() => setOpenSheet(null)}
        />
      )}

      {openSheet === "companions" && (
        <CompanionsEditorSheet
          initial={draft.companions}
          patientRole={draft.accident.role}
          onSave={(companions) => editDraft((current) => ({ ...current, companions }))}
          onCancel={() => setOpenSheet(null)}
        />
      )}

      {openSheet === "documents" && (
        <DocumentsEditorSheet
          submissionId={summary.submissionId}
          kept={draft.keptDocuments}
          added={draft.addedDocuments}
          onSave={(keptDocuments, addedDocuments) =>
            editDraft((current) => ({ ...current, keptDocuments, addedDocuments }))
          }
          onCancel={() => setOpenSheet(null)}
          onUploaded={(storagePath) => uploadedPaths.current.add(storagePath)}
        />
      )}

      {pendingLeave && (
        <div className="absolute inset-0 z-40 flex items-end bg-black/35">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="case-summary-unsaved-title"
            aria-describedby="case-summary-unsaved-body"
            className="w-full rounded-t-[20px] bg-white px-[20px] pb-[24px] pt-[12px]"
          >
            <div className="mx-auto mb-[12px] h-[4px] w-[44px] rounded-full bg-[#d1d1d6]" />
            <h2
              id="case-summary-unsaved-title"
              className="mb-[8px] text-center text-[20px] font-extrabold text-black"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("unsavedTitle")}
            </h2>
            <p
              id="case-summary-unsaved-body"
              className="mb-[16px] text-center text-[14px] leading-[20px] text-[#6e6e73]"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {t("unsavedBody")}
            </p>
            <div className="flex flex-col gap-[8px]">
              <button
                type="button"
                autoFocus
                onClick={() => setPendingLeave(null)}
                className="h-[56px] w-full rounded-[16px] bg-brand text-[16px] font-semibold text-white"
                style={{ fontFamily: "var(--font-nunito-sans)" }}
              >
                {t("keepEditing")}
              </button>
              <button
                type="button"
                onClick={discardAndLeave}
                className="h-[24px] text-center text-[14px] font-semibold text-[#6E6E73] underline"
                style={{ fontFamily: "var(--font-nunito-sans)" }}
              >
                {t("discard")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
