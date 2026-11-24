"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { useParams } from "next/navigation";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { ScreenHeader } from "@/components/layout/screen-header";
import { IncidentProgress, type ProgressStep } from "@/components/intake/incident-progress";
import { AttorneyActionsDialog } from "@/components/providers/attorney-actions-dialog";
import { attorneyStage } from "@/lib/attorney-stage";
import { clearIntakeResumeDraft, clearIntakeSession } from "@/lib/intake-session";
import { teamMatches } from "@/lib/provider-matches";
import { PLACEHOLDER_ATTORNEY, PLACEHOLDER_DOCTOR } from "@/lib/providers";
import { signedSinceLastRead } from "@/lib/signing-step";
import { createClient } from "@/lib/supabase/client";
import { getPatientDashboard, PatientDashboardUnavailableError, type PatientDashboard } from "@/services/intake";

// TODO: replace with the calculated range once the settlement simulator ships
const SETTLEMENT_RANGE = "$28,000 - $42,000";

// The step each case status stands on, by exact value — the statuses
// GET /patient/dashboard can return (backend lib/case-status.ts). Anything else
// stays on Attorney, the first step after intake.
const STEP_BY_STATUS: Readonly<Record<string, ProgressStep>> = {
  submitted: "stepAttorney",
  retainer_pending_signature: "stepAttorney",
  not_qualified: "stepAttorney",
  signed: "stepAttorneyCall",
  attorney: "stepAttorneyCall",
  qualified: "stepAttorneyCall",
  doctor: "stepDoctor",
};

// Up next, by exact status. Approved for the retainer, the patient's next move
// is the matched attorney (5366:15494); signed, the attorney's contact
// (5366:15849). Anything else is still in review.
const UP_NEXT_BY_STATUS: Readonly<
  Record<string, "viewMatchedAttorney" | "attorneyWillContact" | "attorneyCall" | "findingDoctor">
> = {
  retainer_pending_signature: "viewMatchedAttorney",
  signed: "attorneyWillContact",
  attorney: "attorneyCall",
  qualified: "attorneyCall",
  doctor: "findingDoctor",
};

const DASHBOARD_REFRESH_MS = 30_000;

function normalizeStatus(status: string | null | undefined): string {
  return status?.trim().toLowerCase() ?? "";
}

function getGreetingKey() {
  const hour = new Date().getHours();
  if (hour < 12) return "greetingMorning";
  if (hour < 17) return "greetingAfternoon";
  return "greetingEvening";
}

// "2026-09-08" -> "9/8/26", matching the Figma incident label. Parsed from the ISO
// parts so a date-only value never shifts a day across a timezone.
function formatIncidentDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  return `${Number(month)}/${Number(day)}/${year.slice(2)}`;
}

export default function IntakeDashboardPage() {
  const t = useTranslations("IntakeDashboard");
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const [dashboard, setDashboard] = useState<PatientDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attorneyDialogOpen, setAttorneyDialogOpen] = useState(false);
  const closeAttorneyDialog = useCallback(() => setAttorneyDialogOpen(false), []);
  const startingNewIntakeRef = useRef(false);
  const [startingNewIntake, setStartingNewIntake] = useState(false);
  const [startError, setStartError] = useState("");
  const lastStatusSignatureRef = useRef("");

  useEffect(() => {
    let cancelled = false;

    // Every arrival reads the case again before drawing it. With cacheComponents
    // the router restores this page as it was left rather than mounting it anew;
    // coming back from signing, that is a case still waiting for its signature,
    // and it must not be shown while the backend's answer is on its way.
    setLoading(true);

    const refreshDashboard = async (background = false) => {
      try {
        let data = await getPatientDashboard();
        if (cancelled) return;

        // A retainer signed in DocuSign that the backend has not heard about yet
        // is recorded by asking it, and the case it then holds is the one drawn,
        // so a signed patient is never offered the attorney again.
        const signedMeanwhile = await signedSinceLastRead(data.cases[0]);
        if (cancelled) return;
        if (signedMeanwhile) {
          data = await getPatientDashboard();
          if (cancelled) return;
        }

        const nextCase = data.cases[0];
        const nextNormalizedStatus = nextCase ? normalizeStatus(nextCase.status) || "submitted" : "";
        // A status change or a match arriving between refreshes redraws the
        // attorney and the team cards too; so does a name or incident date the
        // patient corrected on Case Summary, which the greeting and tracker show.
        const nextMatches = teamMatches(nextCase);
        const nextStatusSignature = [
          nextCase?.submissionId ?? "",
          nextNormalizedStatus,
          nextMatches.lawyer,
          nextMatches.doctor,
          data.patient?.firstName ?? "",
          nextCase?.incidentDate ?? "",
        ].join("|");

        if (nextStatusSignature !== lastStatusSignatureRef.current) {
          lastStatusSignatureRef.current = nextStatusSignature;
          setDashboard(data);
        }

        setError("");
      } catch (error) {
        if (cancelled) return;

        // A signed-in account with no submitted case. Sending it into the flow from
        // here cannot work while the session exists: the proxy returns signed-in
        // visitors on the flow's entry routes to this dashboard (lib/supabase/proxy.ts).
        // It lands on the empty state, whose Start a new intake ends the session.
        if (error instanceof PatientDashboardUnavailableError && error.code === "intake_incomplete") {
          if (!background) setDashboard(null);
          return;
        }

        // Keep the current UI on background refresh failures and try again on the
        // next tick/focus instead of flashing to the error state.
        if (!background) setError(t("errorText"));
      } finally {
        if (!cancelled && !background) setLoading(false);
      }
    };

    void refreshDashboard();

    const intervalId = window.setInterval(() => {
      void refreshDashboard(true);
    }, DASHBOARD_REFRESH_MS);

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshDashboard(true);
      }
    };

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [t]);

  // Starting over from the empty state. While a session exists the proxy sends
  // every entry route back here, so it ends first; the account holds no submitted
  // case, so nothing is lost. The outcome is judged by whether the tab still holds
  // a session, not by signOut's error: the auth client drops the local session
  // before it reports a logout call that failed. Earlier answers, the submission id
  // and the submitted marker go only after that. An account whose earlier intake
  // was abandoned picks that submission up again at /intake/start.
  const handleStartNewIntake = async () => {
    if (startingNewIntakeRef.current) return;
    startingNewIntakeRef.current = true;
    setStartingNewIntake(true);
    setStartError("");

    const supabase = createClient();
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // judged by the session check below
    }

    let stillSignedIn = true;
    try {
      const { data } = await supabase.auth.getSession();
      stillSignedIn = Boolean(data.session);
    } catch {
      // an unreadable session counts as still signed in
    }

    if (stillSignedIn) {
      startingNewIntakeRef.current = false;
      setStartingNewIntake(false);
      setStartError(t("startNewIntakeError"));
      return;
    }

    clearIntakeSession(sessionStorage);
    clearIntakeResumeDraft(sessionStorage);
    // A full load into the flow, as get-help itself uses: the client router can
    // still hold the proxy's redirect from the session that just ended.
    window.location.replace(`/${locale}/get-help`);
  };

  const activeCase = dashboard?.cases[0];
  // The greeting reads the name from the dashboard the backend returned, never a
  // copy of it. Coming back from a provider screen, the router restores this page
  // with its state rather than mounting it again: the effect re-ran, a copy was
  // reset from sessionStorage (empty for a patient who signed in), and the refresh
  // that followed saw an unchanged case and left that empty copy in place.
  const firstName = dashboard?.patient?.firstName?.trim() ?? "";
  const incidentDate = formatIncidentDate(activeCase?.incidentDate);
  const effectiveStatus = activeCase ? normalizeStatus(activeCase.status) || "submitted" : "";
  const currentStep = STEP_BY_STATUS[effectiveStatus] ?? "stepAttorney";
  const stage = attorneyStage(activeCase);
  // Figma 5366:15681 — while the case is in review the run is drawn grey; from the
  // approval on (5366:15494, 5366:15849) it is brand.
  const inReview = stage === "none" && currentStep === "stepAttorney";
  const upNextKey = UP_NEXT_BY_STATUS[effectiveStatus] ?? "caseInReview";
  const matches = teamMatches(activeCase);

  // The design's team is the doctor and the attorney. The doctor's card is live
  // only when the backend reports a doctor matched with this case. The attorney's
  // follows the case status (lib/attorney-stage.ts): offered once the retainer is
  // approved (Recommended, opening the matched attorney), hired once it is signed
  // (Connected, opening the attorney's actions). Until then a card is inert and
  // names no one. Names come from the provider records in lib/providers.ts; the
  // illustrations are the Figma renders.
  const team = [
    {
      key: "doctor",
      src: "/assets/intake/doctor-character.webp",
      live: matches.doctor,
      caption: matches.doctor ? PLACEHOLDER_DOCTOR.name : t("findingDoctor"),
      status: null,
      notFound: t("doctorNotFound"),
      notify: matches.doctor && effectiveStatus === "doctor",
      href: matches.doctor ? `/${locale}/intake/dashboard/doctor` : null,
      opensDialog: false,
    },
    {
      key: "attorney",
      src: "/assets/intake/attorney-character.webp",
      live: stage !== "none",
      caption: stage === "none" ? t("findingAttorney") : PLACEHOLDER_ATTORNEY.name,
      status:
        stage === "recommended" ? t("attorneyRecommended") : stage === "connected" ? t("attorneyConnected") : null,
      notFound: t("lawyerNotFound"),
      // The attorney's bell rings in review, approved and signed alike (5366:15681,
      // 5366:15494, 5366:15849); a case closed without representation has nothing coming.
      notify: effectiveStatus !== "not_qualified",
      href: stage === "recommended" ? `/${locale}/intake/choose-attorney` : null,
      opensDialog: stage === "connected",
    },
  ];

  const upNext = (
    <>
      <span
        className="h-[20px] text-[20px] font-black uppercase leading-[24.2px] text-[#cc007e]"
        style={{ fontFamily: "var(--font-inter)" }}
      >
        {t("upNext")}
      </span>
      {/* the design's text box is 304px wide in review and 320px once approved,
          which is what breaks the line where it does */}
      <span
        className={`${stage === "none" ? "max-w-[304px]" : "max-w-[320px]"} text-[26px] font-medium leading-[1.1] text-black`}
        style={{ fontFamily: "var(--font-inter)" }}
      >
        {t(upNextKey)}
      </span>
    </>
  );
  // in review the frame's block is 54px tall (5783:5481)
  // Figma strokes the 4px rule inside the block, so the text sits 16px from
  // the block's edge — 12px after the rule.
  const upNextClass = `flex flex-col border-l-[4px] border-[#cc007e] pl-[12px] ${
    stage === "none" ? "h-[54px] gap-[6px]" : "gap-[13px]"
  }`;

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      {/* Keep the dashboard header consistent with the rest of intake. */}
      <ScreenHeader showLanguageSelector={false} />

      {/* the header's own side margin from md up, so the logo and the content share one edge */}
      <main className="flex flex-1 flex-col gap-[24px] overflow-y-auto px-[23px] pb-[40px] pt-[16px] md:px-[28px]">
        {loading && (
          <section className="flex flex-1 items-center justify-center">
            <p
              className="text-[14px] font-semibold text-[#6e6e73]"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {t("loading")}
            </p>
          </section>
        )}

        {!loading && error && (
          <section className="flex flex-1 flex-col items-center justify-center gap-[16px] text-center">
            <p
              className="text-[16px] font-semibold text-[#111]"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {error}
            </p>
          </section>
        )}

        {!loading && !error && !activeCase && (
          <section className="flex flex-1 flex-col items-center justify-center gap-[16px] text-center">
            <h1
              className="text-[28px] font-extrabold leading-[1] text-black"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("emptyTitle")}
            </h1>
            <p
              className="text-[14px] leading-[20px] text-[#6e6e73]"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {t("emptyText")}
            </p>
            <button
              type="button"
              onClick={() => void handleStartNewIntake()}
              disabled={startingNewIntake}
              aria-busy={startingNewIntake}
              className="mt-[8px] flex h-[52px] w-full max-w-[280px] items-center justify-center rounded-[16px] bg-brand px-[20px] text-[16px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cc007e] focus-visible:ring-offset-2 disabled:opacity-60"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("emptyCta")}
            </button>
            {startError && (
              <p
                role="alert"
                className="text-[12px] text-[#cc007e] text-center"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {startError}
              </p>
            )}
          </section>
        )}

        {!loading && !error && activeCase && (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Figma 5783:5481: content starts 23px in, and each block sits where
                the frame puts it rather than on one shared gap. */}
            <div className="flex flex-col">
              {/* Greeting — one text box in the frame, the two lines touching */}
              <section className="flex flex-col">
                <p
                  className="text-[22px] font-bold leading-[1.15] text-[#101828]"
                  style={{ fontFamily: "var(--font-nunito-sans)" }}
                >
                  {t(getGreetingKey())}
                </p>
                <h1
                  className="mt-[1px] min-w-0 break-words text-[42px] font-extrabold leading-[0.95] text-black"
                  style={{ fontFamily: "var(--font-nunito-sans)" }}
                >
                  {firstName}
                </h1>
              </section>

              {/* Up next — the design's DoThisNext block: a 4px brand rule on the
                  block's own left edge (not the screen's), the text 16px from that edge.
                  Once the retainer is approved it is the way to the matched
                  attorney (5366:15494), as the attorney's card is. */}
              {/* Figma 5783:5481 puts View Case Summary 22px under the block */}
              <div className="mt-[16px] flex flex-col gap-[22px]">
                {stage === "recommended" ? (
                  <Link
                    href={`/${locale}/intake/choose-attorney`}
                    className={`${upNextClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cc007e] focus-visible:ring-offset-2`}
                  >
                    {upNext}
                  </Link>
                ) : (
                  <section className={upNextClass}>{upNext}</section>
                )}

                {/* The patient's own case — the backend decides what it shows
                    and whether it can still be changed */}
                <Link
                  href={`/${locale}/case/${encodeURIComponent(activeCase.submissionId)}`}
                  data-testid="view-case-summary"
                  className="mt-[4px] flex h-[16px] items-start self-start text-[16px] leading-[15px] text-[#cc007e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cc007e] focus-visible:ring-offset-2"
                >
                  {/* The design underlines the space before the arrow too, which
                      text-decoration will not do at the end of a run; the rule is
                      drawn where the frame's export puts it: 0.63px at 13.28px. */}
                  <span
                    className="relative whitespace-pre font-semibold"
                    style={{ fontFamily: "var(--font-nunito-sans)" }}
                  >
                    {`${t("viewCaseSummary")} `}
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 top-[13.28px] h-[0.63px] bg-current"
                    />
                  </span>
                  {/* The design's "↗" is Inter Medium's own glyph, outlined from the
                      frame's export: the app's Inter subset has no arrows, and the
                      fallback font drew a long thin one. 3px after the space, its
                      top level with the line's top, 8.8px square. */}
                  <svg
                    width="8.785"
                    height="8.796"
                    viewBox="158.57 0 8.785 8.796"
                    fill="currentColor"
                    aria-hidden="true"
                    className="ml-[3.3px] shrink-0"
                  >
                    <path d="M159.61 8.79581L158.57 7.75036L164.872 1.43785H160.042L160.053 0.000354767H167.355V7.30717H165.906L165.917 2.47763L159.61 8.79581Z" />
                  </svg>
                </Link>
              </div>

              {/* Settlement estimate — understated grey, no badge */}
              <section className="mt-[23px] flex flex-col gap-[8px]">
                <p
                  className="text-[24px] font-medium leading-none text-[#a0a0a0]"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  {SETTLEMENT_RANGE}
                </p>
                <p
                  className="flex items-center gap-[8px] text-[16px] font-normal leading-none text-[#a0a0a0]"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  {t("runSimulator")}
                  {/* arrow-right, exported from the frame (Figma 3778:15024) */}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden="true"
                    className="shrink-0"
                  >
                    <path
                      d="M2.91602 6.99786H11.0836M6.99982 11.0817L11.0836 6.99786L6.99982 2.91406"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </p>
              </section>

              {/* Your team — Figma 3778:15003, cards 140px with the bell in the corner */}
              {/* No gap here — the ul's own pt-[13px] is the full heading-to-cards
                  distance the frame draws (Team_Row at 13px, 3778:15003). */}
              <section className="mt-[24px] flex flex-col pt-[7px]">
                <p
                  className="-ml-[2px] text-[16px] font-black uppercase leading-none text-[#5c5c5c]"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  {t("yourTeam")}
                </p>

                {/* Team_Row (Figma 3778:15003): 13px above the cards, 29px in from
                    the left and 48px from the right, with a 36px gutter — so at
                    393 the two 140px cards land exactly. They are laid from the left
                    (29px in, 36px apart), which lands them there at 393 and keeps
                    them under the content at any width rather than floating in
                    the middle; from sm up they start at the content's own edge. */}
                <ul className="flex justify-start gap-[36px] pl-[6px] pt-[15px] sm:gap-[24px] sm:pl-0">
                  {team.map((member) => {
                    const card = (
                      <>
                        <Bell
                          size={15}
                          strokeWidth={1.5}
                          className={`absolute right-[10px] top-[10px] z-[1] ${
                            member.notify
                              ? "animate-haa-bell-ring text-[#cc007e] motion-reduce:animate-none"
                              : "text-[#5c5c5c]"
                          }`}
                          aria-hidden="true"
                        />
                        {/* Figma 5783:5481: the doctor's art is 133px tall at the top of a
                            120x141 box; the attorney's fills 116x139 */}
                        <div
                          className={`flex w-full justify-center rounded-[4px] ${
                            member.key === "doctor"
                              ? "h-[141px] max-w-[120px] items-start"
                              : "h-[139px] max-w-[116px] items-center"
                          }`}
                        >
                          <Image
                            src={member.src}
                            alt=""
                            width={256}
                            height={384}
                            loading="eager"
                            unoptimized
                            decoding="sync"
                            className={`${member.key === "doctor" ? "h-[133px]" : "h-[139px]"} w-auto max-w-full object-contain`}
                          />
                        </div>
                        <span
                          className={`flex w-full flex-col items-center text-center text-[12px] font-semibold ${
                            member.live ? "" : "pt-[2px]"
                          }`}
                          style={{ fontFamily: "var(--font-inter)" }}
                        >
                          <span
                            className={`line-clamp-2 min-h-[30px] leading-[1.25] text-[#101828] ${
                              member.live ? "w-full" : "w-[94px]"
                            }`}
                          >
                            {member.caption}
                          </span>
                          {member.status && <span className="leading-[normal] text-[#a0a0a0]">{member.status}</span>}
                        </span>
                      </>
                    );

                    // A live card is white and lifted (5366:15494, 5366:15849); an
                    // inert one sits on the design's #F8F8F8 (5366:15681).
                    const liveClass =
                      "relative flex h-full w-full min-w-0 flex-col items-center gap-[6px] rounded-[12px] border border-[#f8f8f8] bg-white p-[8px] shadow-[0_0_18px_4px_white,0_0_10px_2px_rgba(255,255,255,0.8),0_0_4px_0_rgba(0,0,0,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cc007e] focus-visible:ring-offset-2";

                    return (
                      <li
                        key={member.key}
                        className="flex h-[206px] w-[140px] min-w-0 shrink"
                        data-provider-matched={member.live}
                        data-team-member={member.key}
                      >
                        {member.href ? (
                          // the whole card is the affordance — the matched attorney
                          // (5366:15577) or the doctor's screen (4200:12992)
                          <Link
                            href={member.href}
                            className={liveClass}
                          >
                            {card}
                          </Link>
                        ) : member.opensDialog ? (
                          // the connected attorney opens its actions (5366:16012)
                          <button
                            type="button"
                            aria-haspopup="dialog"
                            onClick={() => setAttorneyDialogOpen(true)}
                            className={`${liveClass} text-left`}
                          >
                            {card}
                          </button>
                        ) : (
                          // Not there yet: inert — no href, no handler and out of
                          // the tab order, so neither a pointer nor a key can open a
                          // provider who is not there.
                          <div
                            role="link"
                            aria-disabled="true"
                            aria-label={member.notFound}
                            className="relative flex h-full w-full min-w-0 cursor-default select-none flex-col items-center gap-[6px] rounded-[12px] bg-[#f8f8f8] p-[8px] shadow-[0_0_4px_0_rgba(0,0,0,0.05)]"
                          >
                            {card}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>

            {/* Incident progress — the design's full-bleed band, right under the cards */}
            <IncidentProgress
              current={currentStep}
              inReview={inReview}
              incidentDate={incidentDate}
            />

            <AttorneyActionsDialog
              open={attorneyDialogOpen && stage === "connected"}
              onClose={closeAttorneyDialog}
              provider={PLACEHOLDER_ATTORNEY}
            />
          </div>
        )}
      </main>
    </div>
  );
}
