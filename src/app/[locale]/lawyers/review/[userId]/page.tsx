import { LawyerDocumentGallery, type LawyerDocumentGroup } from "@/components/lawyers/document-gallery";
import { DecisionActions } from "@/components/review/decision-actions";
import { ReviewCaseTabs } from "@/components/review/review-case-tabs";
import { INJURY_OPTIONS, type InjuryOptionKey } from "@/lib/constants";
import { parseReviewAccess, REVIEW_ACCESS_COOKIE } from "@/lib/review-access";
import { getLawyerReviewCase, type LawyerReviewCase } from "@/services/intake";
import { Logo } from "@/components/logo";
import { Lock } from "lucide-react";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export const instant = false;

type Translator = Awaited<ReturnType<typeof getTranslations>>;

const EVIDENCE_CATEGORIES = ["accidentReport", "driversLicense", "incidentPhotos", "insuranceCard"];
const COMPANION_RELATION_KEYS: Record<string, string> = {
  passenger: "relationPassenger",
  driver: "relationDriver",
  other: "relationOther",
};

function formatLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function translatedOr(t: Translator, key: string, fallback: string): string {
  return t.has(key) ? t(key) : fallback;
}

// incident_date is a calendar date with no time or zone, so it is formatted in
// UTC; a local zone would move it a day for anyone west of Greenwich.
function formatDate(value: string | null, locale: string): string | null {
  if (!value) return null;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "2-digit", timeZone: "UTC" }).format(
    parsed
  );
}

function formatPhoneNumber(value: string | null): string | null {
  const raw = value?.trim() ?? "";
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

function formatInjuries(injuries: string | null, tInjury: Translator): string | null {
  const parts = (injuries ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (!parts.length) return null;

  return parts
    .map((part) =>
      INJURY_OPTIONS.includes(part as InjuryOptionKey) ? translatedOr(tInjury, part, formatLabel(part)) : part
    )
    .join(" · ");
}

function ValueRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 py-3">
      <p className="text-[11px] font-bold uppercase text-neutral-500">{label}</p>
      <div className="mt-1 break-words text-sm font-medium text-neutral-950">{value}</div>
    </div>
  );
}

function InfoSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="border-b border-neutral-200 py-4">
      {title ? <h2 className="text-[11px] font-bold uppercase text-neutral-500">{title}</h2> : null}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </section>
  );
}

function Withheld({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 italic text-neutral-500">
      <Lock
        aria-hidden
        className="h-3.5 w-3.5 shrink-0"
      />
      {label}
    </span>
  );
}

function SignedRetainer({ retainer, t }: { retainer: NonNullable<LawyerReviewCase["signedRetainer"]>; t: Translator }) {
  if (!retainer.available) return null;

  return (
    <a
      href="/api/review/retainer"
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 block w-fit text-sm font-semibold text-[#cc007e] underline underline-offset-2"
    >
      {t("retainerView")}
    </a>
  );
}

export default async function LawyerReviewByUserIdPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; userId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, userId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const tokenParam = resolvedSearchParams.t;
  const submissionParam = resolvedSearchParams.submissionId;
  const requestedSubmissionId = Array.isArray(submissionParam) ? submissionParam[0] : submissionParam;
  const linkToken = Array.isArray(tokenParam) ? (tokenParam[0] ?? "") : (tokenParam ?? "");

  // A fresh link is exchanged for the review cookie first, which takes the
  // token out of the address bar.
  if (requestedSubmissionId && linkToken) {
    const nextPath = `/${locale}/review/${encodeURIComponent(userId)}?submissionId=${encodeURIComponent(requestedSubmissionId)}`;
    redirect(
      `/api/review/unlock-link?claimantUserId=${encodeURIComponent(userId)}&submissionId=${encodeURIComponent(requestedSubmissionId)}&t=${encodeURIComponent(linkToken)}&next=${encodeURIComponent(nextPath)}`
    );
  }

  const access = parseReviewAccess((await cookies()).get(REVIEW_ACCESS_COOKIE)?.value);
  if (!access || access.claimantUserId !== userId) {
    redirect("/");
  }

  // The backend decides what this link may see. Nothing identifying is in the
  // answer until the lawyer has accepted, so there is nothing here to hide.
  const result = await getLawyerReviewCase(access);
  if (!result.ok && result.code === "denied") {
    redirect("/");
  }

  const t = await getTranslations("LawyerReview");
  const tCase = await getTranslations("Case");
  const tInjury = await getTranslations("IntakeInjury");
  const tEvidence = await getTranslations("IntakeEvidence");
  const tCompanion = await getTranslations("IntakeWhoWasWithYou");

  const header = (
    <div className="pb-2">
      <Logo
        variant="wordmarkCompact"
        priority
      />
    </div>
  );

  if (!result.ok) {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        {header}
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {t("loadError")}
        </p>
      </main>
    );
  }

  const reviewCase = result.reviewCase;
  const { caseFacts } = reviewCase;
  const full = reviewCase.access === "full" ? reviewCase : null;
  const withheld = <Withheld label={t("availableAfterAcceptance")} />;
  const notProvided = t("notProvided");
  const orNotProvided = (value: string | null) => value ?? notProvided;

  const categoryLabel = (category: string) =>
    EVIDENCE_CATEGORIES.includes(category)
      ? tEvidence(`category.${category}`)
      : category === "uncategorized"
        ? t("documentOther")
        : formatLabel(category) || t("documentOther");
  const relationLabel = (relation: string | null) => {
    if (!relation) return notProvided;
    const key = COMPANION_RELATION_KEYS[relation];
    return key ? tCompanion(key) : formatLabel(relation);
  };
  const language = caseFacts.language
    ? translatedOr(t, `languages.${caseFacts.language}`, caseFacts.language)
    : notProvided;
  const incidentType = caseFacts.incidentType
    ? translatedOr(tCase, `incidentTypes.${caseFacts.incidentType}`, formatLabel(caseFacts.incidentType))
    : notProvided;
  const role = caseFacts.role
    ? translatedOr(tCase, `roles.${caseFacts.role}`, formatLabel(caseFacts.role))
    : notProvided;
  const patientName = full ? [full.patient.firstName, full.patient.lastName].filter(Boolean).join(" ") : "";
  const documents = reviewCase.documents;
  const documentTotal = documents
    ? documents.length
    : caseFacts.documentCounts.reduce((total, entry) => total + entry.count, 0);
  const companionTotal = full ? full.companions.length : caseFacts.companionRelations.length;

  // Files open through this app's own route, never from a Storage URL. Before
  // acceptance a file has no name of its own here, so it is numbered instead.
  const documentGroups: LawyerDocumentGroup[] = documents
    ? [...new Set(documents.map((document) => document.category))]
        .map((category) => ({
          key: category,
          label: categoryLabel(category),
          items: documents
            .filter((document) => document.category === category)
            .map((document, index, sameCategory) => ({
              id: document.id,
              // Counted per kind within the group: Photo 1, File 1, Photo 2.
              fileName:
                document.fileName ??
                (full
                  ? t("unnamedFile")
                  : t("documentNumbered", {
                      kind: document.kind,
                      number: sameCategory.slice(0, index + 1).filter((other) => other.kind === document.kind).length,
                    })),
              sizeLabel:
                document.fileSize === null
                  ? t("unknownSize")
                  : t("fileSizeMb", { size: (document.fileSize / 1024 / 1024).toFixed(2) }),
              kind: document.kind,
              url: document.available ? `/api/review/documents/${encodeURIComponent(document.id)}` : null,
            })),
        }))
        .sort((a, b) => a.label.localeCompare(b.label))
    : [];

  const isAccepted = reviewCase.review.status === "accepted";
  const showNewClientTitle = !isAccepted && reviewCase.review.status !== "rejected";
  const pageTitle = isAccepted ? patientName || t("title") : showNewClientTitle ? t("title") : null;
  const hasDecisionActions = reviewCase.review.canDecide && reviewCase.review.status === "pending";
  const summary = (
    <div>
      <InfoSection>
        <div className="divide-y divide-neutral-100">
          {!isAccepted ? (
            <ValueRow
              label={t("name")}
              value={full ? patientName || notProvided : withheld}
            />
          ) : null}
          <ValueRow
            label={t("phone")}
            value={full ? orNotProvided(formatPhoneNumber(full.patient.mobile)) : withheld}
          />
          <ValueRow
            label={t("email")}
            value={full ? orNotProvided(full.patient.email) : withheld}
          />
          <ValueRow
            label={t("residence")}
            value={full ? orNotProvided(full.patient.residence) : withheld}
          />
        </div>
      </InfoSection>

      <InfoSection>
        <div className="grid gap-x-6 divide-y divide-neutral-100 sm:grid-cols-2 sm:divide-y-0">
          <ValueRow
            label={t("incidentType")}
            value={incidentType}
          />
          <ValueRow
            label={t("incidentDate")}
            value={orNotProvided(formatDate(reviewCase.incident.date, locale))}
          />
          <ValueRow
            label={t("incidentLocation")}
            value={orNotProvided(reviewCase.incident.location)}
          />
          <ValueRow
            label={t("role")}
            value={role}
          />
          <ValueRow
            label={t("language")}
            value={language}
          />
        </div>
      </InfoSection>

      <InfoSection title={t("whoWasWithYou")}>
        {companionTotal === 0 ? (
          <p className="py-2 text-sm text-neutral-600">{t("companionsNone")}</p>
        ) : full ? (
          <div className="divide-y divide-neutral-100">
            {full.companions.map((companion, index) => (
              <div
                key={`companion-${index}`}
                className="py-3"
              >
                <p className="text-sm font-medium text-neutral-950">
                  {[companion.firstName, companion.lastName].filter(Boolean).join(" ") || t("unnamedCompanion")}
                  <span className="text-neutral-600"> · {relationLabel(companion.relation)}</span>
                </p>
                <p className="mt-1 text-sm text-neutral-600">
                  {formatPhoneNumber(companion.cellNumber) ?? notProvided}
                  {companion.email ? ` · ${companion.email}` : ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {caseFacts.companionRelations.map((relation, index) => (
              <div
                key={`companion-${index}`}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <p className="text-sm font-medium text-neutral-950">{relationLabel(relation)}</p>
                <Withheld label={t("companionMasked")} />
              </div>
            ))}
          </div>
        )}
      </InfoSection>

      <InfoSection title={t("injuries")}>
        <p className="py-2 text-sm leading-6 text-neutral-900">
          {formatInjuries(caseFacts.injuries, tInjury) ?? notProvided}
        </p>
      </InfoSection>

      <InfoSection>
        <ValueRow
          label={t("treatmentArea")}
          value={full ? orNotProvided(full.patient.treatmentArea) : withheld}
        />
        {reviewCase.signedRetainer ? (
          <SignedRetainer
            retainer={reviewCase.signedRetainer}
            t={t}
          />
        ) : null}
      </InfoSection>
    </div>
  );

  const story = (
    <InfoSection title={t("story")}>
      <p className="whitespace-pre-line py-2 text-sm leading-6 text-neutral-900">{caseFacts.story ?? notProvided}</p>
    </InfoSection>
  );

  const documentContent = (
    <section className="py-4">
      <h2 className="text-[11px] font-bold uppercase text-neutral-500">
        {t("documentsTitle", { count: documentTotal })}
      </h2>
      <div className="mt-3">
        {documents ? (
          <LawyerDocumentGallery groups={documentGroups} />
        ) : documentTotal === 0 ? (
          <p className="py-3 text-sm text-neutral-600">{t("documentsNone")}</p>
        ) : (
          <div>
            <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
              {caseFacts.documentCounts.map((entry) => (
                <li
                  key={entry.category}
                  className="flex items-center justify-between gap-4 py-3 text-sm"
                >
                  <span className="font-medium text-neutral-950">{categoryLabel(entry.category)}</span>
                  <span className="shrink-0 text-neutral-600">{t("documentFileCount", { count: entry.count })}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-neutral-500">{t("documentsClosed")}</p>
          </div>
        )}
      </div>
    </section>
  );

  return (
    <main
      className={`mx-auto min-h-screen w-full max-w-[720px] bg-white px-4 ${hasDecisionActions ? "pb-44" : "pb-6"} pt-5 sm:px-6`}
    >
      {header}
      <div className="mt-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {pageTitle ? (
            <h1 className="break-words font-nunito text-[28px] font-extrabold leading-tight text-[#25252b]">
              {pageTitle}
            </h1>
          ) : null}
          <p className={`${pageTitle ? "mt-1" : ""} text-[14px] font-medium text-[#7a7d86]`}>
            {[incidentType, role].filter((item) => item !== notProvided).join(" · ")}
          </p>
        </div>
        <DecisionActions
          canDecide={reviewCase.review.canDecide}
          status={reviewCase.review.status}
          responseDeadline={reviewCase.review.responseDeadline}
          className="mt-0"
        />
      </div>

      <ReviewCaseTabs
        ariaLabel={t("caseTitle")}
        labels={{ summary: t("tabSummary"), story: t("tabStory"), documents: t("tabDocuments") }}
        summary={summary}
        story={story}
        documents={documentContent}
      />
    </main>
  );
}
