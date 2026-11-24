"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { usePreloadImages } from "@/hooks/use-preload-images";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { companionRelationLabelKey } from "@/lib/companion-relations";
import { INJURY_OPTIONS, type InjuryOptionKey } from "@/lib/constants";
import { clearIntakeSessionAfterSubmit } from "@/lib/intake-session";
import {
  categoryOf,
  documentsForSubmission,
  readCategories,
  readDocuments,
  readPreviews,
} from "@/lib/intake-documents";
import { DocumentThumbnail } from "@/components/intake/document-thumbnail";
import { AccidentEditorSheet, type AccidentDraft } from "@/components/case-summary/accident-editor-sheet";
import { InjuriesEditorSheet } from "@/components/case-summary/injuries-editor-sheet";
import { NameEditorSheet } from "@/components/case-summary/name-editor-sheet";
import { RecoveryEditorSheet } from "@/components/case-summary/recovery-editor-sheet";
import { SummarySectionHeader } from "@/components/case-summary/summary-section-header";
import { completeIntake } from "@/services/intake";
import { readLocationDetails } from "@/lib/location-storage";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LocationDetails } from "@/types/location";

const TREATMENT_AREA_LOCATION_DETAILS_KEY = "intake_treatmentAreaLocationDetails";
const INCIDENT_LOCATION_DETAILS_KEY = "intake_incidentLocationDetails";

type ReviewSection = "about" | "accident" | "companions" | "injuries" | "recovery" | "documents";

// A successful submit lands on the "We've got it" character.
const NEXT_SCREEN_IMAGES = ["/assets/intake/attorney-character.webp"] as const;

export default function IntakeReviewPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeReview");
  const tSubmit = useTranslations("SubmitError");
  const tIncident = useTranslations("IntakeIncident");
  const tRole = useTranslations("IntakeRole");
  const tInjury = useTranslations("IntakeInjury");
  const tCompanion = useTranslations("IntakeWhoWasWithYou");
  const tEvidence = useTranslations("IntakeEvidence");

  useRequireSessionKey("intake_treatmentArea", "/intake/treatment-area");
  usePreloadImages(NEXT_SCREEN_IMAGES);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isNameEditorOpen, setIsNameEditorOpen] = useState(false);
  const [isAccidentEditorOpen, setIsAccidentEditorOpen] = useState(false);
  const [isInjuriesEditorOpen, setIsInjuriesEditorOpen] = useState(false);
  const [isRecoveryEditorOpen, setIsRecoveryEditorOpen] = useState(false);
  const hasSubmitted = useRef(false);
  const isBrowser = typeof window !== "undefined";

  // The summary is drawn from sessionStorage, which the server cannot see. It
  // is read after mount rather than during render so the first client render
  // still matches the server's: reading it during render made the two disagree
  // and React threw the whole tree away and rebuilt it, taking the document
  // rows with it.
  const [sessionReady, setSessionReady] = useState(false);
  useEffect(() => {
    setSessionReady(true);
  }, []);

  const getSessionValue = useCallback(
    (key: string) => (sessionReady ? sessionStorage.getItem(key) : null),
    [sessionReady]
  );

  const summary = (() => {
    const firstName = getSessionValue("intake_firstName") ?? "";
    const lastName = getSessionValue("intake_lastName") ?? "";
    const phone = getSessionValue("intake_phone") ?? "";
    const email = getSessionValue("intake_email") ?? "";
    const incidentType = getSessionValue("intake_incidentType") ?? "";
    const incidentDate = getSessionValue("intake_incidentDate") ?? "";
    const incidentLocation = getSessionValue("intake_incidentLocation") ?? "";
    const role = getSessionValue("intake_role") ?? "";
    const treatmentArea = getSessionValue("intake_treatmentArea") ?? "";

    const injuries = (() => {
      try {
        const parsed = JSON.parse(getSessionValue("intake_injuries") ?? "{}") as {
          selected?: string[];
          somewhereElse?: string;
        };
        const selected = (parsed.selected ?? []).filter((value): value is InjuryOptionKey =>
          INJURY_OPTIONS.includes(value as InjuryOptionKey)
        );
        const labels = selected.map((value) => tInjury(value));
        const extra = (parsed.somewhereElse ?? "").trim();
        if (extra) labels.push(extra);
        return labels;
      } catch {
        return [] as string[];
      }
    })();

    const companions = (() => {
      try {
        const parsed = JSON.parse(getSessionValue("intake_who_was_with_you_people") ?? "[]") as Array<{
          firstName?: string;
          lastName?: string;
          relation?: string;
        }>;
        if (!Array.isArray(parsed)) return [] as Array<{ name: string; relation: string }>;

        const relationLabel = (value: string) => {
          const key = companionRelationLabelKey(value);
          return key ? tCompanion(key) : value;
        };

        return parsed
          .map((person) => {
            const name = `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim();
            const relation = person.relation ? relationLabel(person.relation) : "";
            return { name, relation };
          })
          .filter((person) => person.name || person.relation);
      } catch {
        return [] as Array<{ name: string; relation: string }>;
      }
    })();

    // The evidence step records every uploaded file in the saved set, and the
    // case submits exactly that — scoped to this submission, so a record left
    // by an earlier intake in the same tab is not counted as this patient's.
    const documents = sessionReady
      ? documentsForSubmission(readDocuments(sessionStorage), getSessionValue("intake_submissionId") ?? "")
      : [];
    const documentCategories = sessionReady ? readCategories(sessionStorage) : {};
    // Thumbnails made when each file went up. Presentation only — a missing
    // one changes nothing about what the case holds.
    const documentPreviews = sessionReady ? readPreviews(sessionStorage) : {};

    const formattedDate = incidentDate
      ? new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }).format(new Date(incidentDate))
      : "";

    const incidentTypeLabel = incidentType ? tIncident(`options.${incidentType}` as never) : "";
    const roleLabel = role ? tRole(role as never) : "";

    return {
      name: `${firstName} ${lastName}`.trim(),
      phone,
      email,
      incidentTypeLabel,
      formattedDate,
      incidentLocation,
      roleLabel,
      injuries,
      companions,
      treatmentArea,
      documents,
      documentCategories,
      documentPreviews,
    };
  })();

  const handleSaveName = (firstName: string, lastName: string) => {
    sessionStorage.setItem("intake_firstName", firstName);
    sessionStorage.setItem("intake_lastName", lastName);
    setIsNameEditorOpen(false);
  };

  const accidentForEditor = (): AccidentDraft => ({
    incidentType: getSessionValue("intake_incidentType") ?? "",
    incidentDate: getSessionValue("intake_incidentDate") ?? "",
    incidentLocation: getSessionValue("intake_incidentLocation") ?? "",
    incidentLocationDetails: readLocationDetails(INCIDENT_LOCATION_DETAILS_KEY),
    role: getSessionValue("intake_role") ?? "",
  });

  const handleSaveAccident = (accident: AccidentDraft) => {
    sessionStorage.setItem("intake_incidentType", accident.incidentType);
    sessionStorage.setItem("intake_incidentDate", accident.incidentDate);
    sessionStorage.setItem("intake_incidentLocation", accident.incidentLocation);
    if (accident.incidentLocationDetails) {
      sessionStorage.setItem(INCIDENT_LOCATION_DETAILS_KEY, JSON.stringify(accident.incidentLocationDetails));
    } else {
      sessionStorage.removeItem(INCIDENT_LOCATION_DETAILS_KEY);
    }
    sessionStorage.setItem("intake_role", accident.role);
    setIsAccidentEditorOpen(false);
  };

  const injuriesForEditor = (): InjuryOptionKey[] => {
    try {
      const parsed = JSON.parse(getSessionValue("intake_injuries") ?? "{}") as { selected?: string[] };
      return (parsed.selected ?? []).filter((value): value is InjuryOptionKey =>
        INJURY_OPTIONS.includes(value as InjuryOptionKey)
      );
    } catch {
      return [];
    }
  };

  const handleSaveInjuries = (selected: InjuryOptionKey[]) => {
    sessionStorage.setItem(
      "intake_injuries",
      JSON.stringify({
        selected,
      })
    );
    setIsInjuriesEditorOpen(false);
  };

  const handleSaveRecovery = (treatmentArea: string, details: LocationDetails | null) => {
    sessionStorage.setItem("intake_treatmentArea", treatmentArea);
    if (details) {
      sessionStorage.setItem(TREATMENT_AREA_LOCATION_DETAILS_KEY, JSON.stringify(details));
    } else {
      sessionStorage.removeItem(TREATMENT_AREA_LOCATION_DETAILS_KEY);
    }
    setIsRecoveryEditorOpen(false);
  };

  // The pencil on the Documents row opens the evidence screen as a document
  // manager: same upload, delete and category state, no second implementation
  // of any of it. The token tells that screen it was opened from here — and
  // being different every time, it reaches the screen even when the router
  // restores the copy it rendered earlier in the flow.
  const openDocumentManager = () => {
    router.push(`/${locale}/intake/evidence?manage=${Date.now().toString(36)}`);
  };

  const goToSection = (section: ReviewSection) => {
    if (section === "documents") {
      openDocumentManager();
      return;
    }

    if (section === "about") {
      router.push(`/${locale}/intake`);
      return;
    }

    if (section === "accident") {
      router.push(`/${locale}/intake/incident`);
      return;
    }

    if (section === "injuries") {
      router.push(`/${locale}/intake/injury`);
      return;
    }

    if (section === "companions") {
      router.push(`/${locale}/intake/who-was-with-you?manage=${Date.now().toString(36)}`);
      return;
    }

    router.push(`/${locale}/intake/treatment-area`);
  };

  const handleSubmit = async () => {
    if (!isBrowser) return;
    if (hasSubmitted.current) return;
    hasSubmitted.current = true;
    setSubmitting(true);
    setSubmitError("");

    const submissionId = sessionStorage.getItem("intake_submissionId") ?? "";

    const categoryMap = JSON.parse(sessionStorage.getItem("intake_document_categories") ?? "{}") as Record<
      string,
      string
    >;
    const documents = (
      JSON.parse(sessionStorage.getItem("intake_documents") ?? "[]") as Array<{
        fileName: string;
        storagePath: string;
        mimeType: string;
        fileSize: number;
        category?: string;
      }>
    ).map((doc) => ({ ...doc, category: doc.category ?? categoryMap[doc.storagePath] ?? categoryMap[doc.fileName] }));

    const injuries = (() => {
      try {
        const parsed = JSON.parse(sessionStorage.getItem("intake_injuries") ?? "{}") as {
          selected?: string[];
          somewhereElse?: string;
        };
        const parts = [...(parsed.selected ?? [])];
        if (parsed.somewhereElse?.trim()) parts.push(parsed.somewhereElse.trim());
        return parts.join(",") || undefined;
      } catch {
        return undefined;
      }
    })();

    const companions = (() => {
      try {
        const parsed = JSON.parse(sessionStorage.getItem("intake_who_was_with_you_people") ?? "[]") as Array<{
          firstName?: string;
          lastName?: string;
          relation?: string;
          cellNumber?: string;
          email?: string;
        }>;

        return parsed
          .map((person) => ({
            firstName: (person.firstName ?? "").trim(),
            lastName: (person.lastName ?? "").trim(),
            relation: (person.relation ?? "").trim(),
            cellNumber: (person.cellNumber ?? "").trim(),
            email: (person.email ?? "").trim() || undefined,
          }))
          .filter((person) => person.firstName && person.relation && person.cellNumber);
      } catch {
        return [] as Array<{
          firstName: string;
          lastName: string;
          relation: string;
          cellNumber: string;
          email?: string;
        }>;
      }
    })();

    const payload = {
      submissionId,
      claimant: {
        residence: sessionStorage.getItem("intake_residence") ?? undefined,
        residenceLocationDetails: readLocationDetails("intake_residenceLocationDetails"),
      },
      accident: {
        incidentType: sessionStorage.getItem("intake_incidentType") ?? "other",
        incidentDate: sessionStorage.getItem("intake_incidentDate") ?? "",
        incidentLocation: sessionStorage.getItem("intake_incidentLocation") ?? "",
        incidentLocationDetails: readLocationDetails("intake_incidentLocationDetails"),
        description: sessionStorage.getItem("intake_description") ?? undefined,
        role: sessionStorage.getItem("intake_role") ?? undefined,
        injuries,
      },
      treatmentArea: sessionStorage.getItem("intake_treatmentArea") ?? "",
      treatmentAreaLocationDetails: readLocationDetails(TREATMENT_AREA_LOCATION_DETAILS_KEY),
      companions,
      documents,
    };

    try {
      await completeIntake(payload);
      clearIntakeSessionAfterSubmit(sessionStorage);
      router.push(`/${locale}/intake/ready`);
    } catch (error) {
      hasSubmitted.current = false;
      setSubmitting(false);
      const message = error instanceof Error ? error.message.trim() : "";
      setSubmitError(message || tSubmit("description"));
    }
  };

  const renderSectionHeader = (title: string, section: ReviewSection, editLabel?: string) => {
    return (
      <SummarySectionHeader
        title={title}
        editLabel={editLabel}
        onEdit={() => {
          if (section === "about") {
            setIsNameEditorOpen(true);
            return;
          }
          if (section === "accident") {
            setIsAccidentEditorOpen(true);
            return;
          }
          if (section === "injuries") {
            setIsInjuriesEditorOpen(true);
            return;
          }
          if (section === "recovery") {
            setIsRecoveryEditorOpen(true);
            return;
          }
          goToSection(section);
        }}
      />
    );
  };

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      <main className="flex-1 overflow-y-auto px-[24px] pt-[32px] pb-[24px]">
        <div>
          <h1
            className="text-[28px] font-extrabold leading-[1.04] text-black"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("heading")}
          </h1>
        </div>

        <div className="mt-[24px] flex flex-col gap-[20px]">
          <section className="flex flex-col gap-[8px]">
            {renderSectionHeader(t("aboutTitle"), "about")}
            <p
              className="text-[16px] font-normal text-black"
              style={{ fontFamily: "var(--font-inter)", fontStyle: "normal", lineHeight: "normal" }}
            >
              {summary.name || t("missing")}
            </p>
            <p
              className="text-[16px] font-normal text-black"
              style={{ fontFamily: "var(--font-inter)", fontStyle: "normal", lineHeight: "normal" }}
            >
              {summary.phone || t("missing")}
            </p>
            <p
              className="text-[16px] font-normal text-black"
              style={{ fontFamily: "var(--font-inter)", fontStyle: "normal", lineHeight: "normal" }}
            >
              {summary.email || ""}
            </p>
          </section>

          <div className="h-px w-full bg-[#e5e7eb]" />

          <section className="flex flex-col gap-[8px]">
            {renderSectionHeader(t("accidentTitle"), "accident")}
            <p
              className="text-[16px] font-normal text-black"
              style={{ fontFamily: "var(--font-inter)", fontStyle: "normal", lineHeight: "normal" }}
            >
              {summary.incidentTypeLabel || t("missing")}
              {summary.formattedDate ? `, ${summary.formattedDate}` : ""}
            </p>
            <p
              className="text-[16px] font-normal text-black"
              style={{ fontFamily: "var(--font-inter)", fontStyle: "normal", lineHeight: "normal" }}
            >
              {summary.incidentLocation || t("missing")}
            </p>
            <p
              className="text-[16px] font-normal text-black"
              style={{ fontFamily: "var(--font-inter)", fontStyle: "normal", lineHeight: "normal" }}
            >
              {summary.roleLabel || t("missing")}
            </p>
          </section>

          <div className="h-px w-full bg-[#e5e7eb]" />

          <section className="flex flex-col gap-[8px]">
            {renderSectionHeader(t("companionsTitle"), "companions")}
            {summary.companions.length ? (
              <>
                <div className="flex flex-col gap-[6px]">
                  {summary.companions.map((person, index) => (
                    <p
                      key={`${person.name}-${person.relation}-${index}`}
                      className="text-[16px] font-normal text-black"
                      style={{ fontFamily: "var(--font-inter)", fontStyle: "normal", lineHeight: "normal" }}
                    >
                      {person.name || t("missing")}
                      {person.relation ? ` · ${person.relation}` : ""}
                    </p>
                  ))}
                </div>
                <p
                  className="text-[14px] font-normal text-[#4d4d4d]"
                  style={{ fontFamily: "var(--font-inter)", fontStyle: "normal", lineHeight: "normal" }}
                >
                  {t("companionsCount", { count: summary.companions.length })}
                </p>
              </>
            ) : (
              <p
                className="text-[16px] font-normal text-black"
                style={{ fontFamily: "var(--font-inter)", fontStyle: "normal", lineHeight: "normal" }}
              >
                {t("missing")}
              </p>
            )}
          </section>

          <div className="h-px w-full bg-[#e5e7eb]" />

          <section className="flex flex-col gap-[8px]">
            {renderSectionHeader(t("injuriesTitle"), "injuries")}
            <p
              className="text-[16px] font-normal text-black"
              style={{ fontFamily: "var(--font-inter)", fontStyle: "normal", lineHeight: "normal" }}
            >
              {summary.injuries.length ? summary.injuries.join(" · ") : t("missing")}
            </p>
          </section>

          <div className="h-px w-full bg-[#e5e7eb]" />

          <section className="flex flex-col gap-[8px]">
            {renderSectionHeader(t("recoveryTitle"), "recovery")}
            <p
              className="text-[16px] font-normal text-black"
              style={{ fontFamily: "var(--font-inter)", fontStyle: "normal", lineHeight: "normal" }}
            >
              {summary.treatmentArea || t("missing")}
            </p>
          </section>

          <div className="h-px w-full bg-[#e5e7eb]" />

          {/* Documents — its own row, counted from what the case will actually
              submit, with the pencil opening the evidence screen to manage it */}
          <section className="flex flex-col gap-[8px]">
            {renderSectionHeader(t("documentsTitle"), "documents", t("editDocuments"))}
            <p
              data-testid="review-document-count"
              className="text-[16px] text-black"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {t("documentsCount", { count: summary.documents.length })}
            </p>
            {summary.documents.length > 0 && (
              <ul className="mt-[4px] flex flex-col gap-[12px]">
                {summary.documents.map((doc) => {
                  const category = categoryOf(doc, summary.documentCategories);
                  return (
                    <li
                      key={doc.storagePath}
                      data-testid="review-document"
                      className="flex items-center gap-[12px]"
                    >
                      <DocumentThumbnail
                        document={doc}
                        preview={summary.documentPreviews[doc.storagePath]}
                        category={category}
                      />
                      {/* The name and what it was filed under belong together:
                          in a narrow right-hand column the category wrapped to
                          three cramped lines beside a long file name. */}
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
        label={t("submit")}
        onClick={handleSubmit}
        loading={submitting}
        error={submitError}
      />

      {isNameEditorOpen && (
        <NameEditorSheet
          initialFirstName={getSessionValue("intake_firstName") ?? ""}
          initialLastName={getSessionValue("intake_lastName") ?? ""}
          onSave={handleSaveName}
          onCancel={() => setIsNameEditorOpen(false)}
        />
      )}

      {isAccidentEditorOpen && (
        <AccidentEditorSheet
          locale={locale}
          initial={accidentForEditor()}
          onSave={handleSaveAccident}
          onCancel={() => setIsAccidentEditorOpen(false)}
        />
      )}

      {isInjuriesEditorOpen && (
        <InjuriesEditorSheet
          initialSelected={injuriesForEditor()}
          onSave={handleSaveInjuries}
          onCancel={() => setIsInjuriesEditorOpen(false)}
        />
      )}

      {isRecoveryEditorOpen && (
        <RecoveryEditorSheet
          initialTreatmentArea={getSessionValue("intake_treatmentArea") ?? ""}
          initialDetails={readLocationDetails(TREATMENT_AREA_LOCATION_DETAILS_KEY)}
          onSave={handleSaveRecovery}
          onCancel={() => setIsRecoveryEditorOpen(false)}
        />
      )}
    </div>
  );
}
