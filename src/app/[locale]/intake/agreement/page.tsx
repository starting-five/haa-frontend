"use client";

import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { ScreenHeader } from "@/components/layout/screen-header";
import { usePreloadImages } from "@/hooks/use-preload-images";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { AGREEMENT_RETURN_MESSAGE, waitForAgreementCompletion } from "@/lib/agreement-completion";
import { DOCUSIGN_LAUNCH_ENABLED, SUPPORT_PHONE_TEL } from "@/lib/constants";
import { startEmbeddedSigning, type EmbeddedSigningHandle, type SessionEndEvent } from "@/lib/docusign-embed";
import { createAgreement } from "@/services/intake";
import posthog from "posthog-js";

// Signing ends on the dashboard, whose team cards draw these two renders.
const NEXT_SCREEN_IMAGES = ["/assets/intake/doctor-character.webp", "/assets/intake/attorney-character.webp"] as const;

type SigningState = "idle" | "opening" | "signing" | "verifying";
// "capacity" is DocuSign refusing to issue another envelope for the account —
// the demo plan's cumulative recipient cap or a call-rate limit. The patient's
// case is intact and nothing they do changes it, so it reads differently from
// a failure of the signing flow itself.
// "paused" is the launch being switched off in this build (DOCUSIGN_LAUNCH_ENABLED):
// nothing was asked of DocuSign, so the notice says the service could not be
// opened and Continue moves the patient on rather than trying again.
type SigningNotice = "" | "unavailable" | "capacity" | "declined" | "paused";

const NOTICE_COPY: Record<
  Exclude<SigningNotice, "">,
  "signingUnavailable" | "signingCapacity" | "declined" | "signingPaused"
> = {
  unavailable: "signingUnavailable",
  capacity: "signingCapacity",
  declined: "declined",
  paused: "signingPaused",
};

/**
 * The agreement step. There is no HAA agreement presentation screen: arriving
 * here from "Review and Sign Agreement" opens DocuSign's own embedded ceremony
 * straight away, mounted with DocuSign's embedding library in an overlay — the
 * browser never navigates to a DocuSign-hosted document and the application
 * stays the page the patient is on. What is signed is the envelope the backend
 * created from its template.
 *
 * Only the backend's word moves the flow on: when DocuSign reports the session
 * ended, the agreement status is fetched and the patient returns to the dashboard
 * solely on a server-confirmed 'completed'. If the ceremony is closed or cannot
 * start, a small relaunch control is shown — never a mock of the document.
 */
export default function IntakeAgreementPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeAgreement");

  // Signing is attached to a submission; without one there is nothing to sign.
  useRequireSessionKey("intake_submissionId", "/intake/phone");
  usePreloadImages(NEXT_SCREEN_IMAGES);

  // Starts on "opening" so the ceremony overlay is present from the first paint
  // and no agreement presentation is shown before DocuSign renders. With the
  // launch switched off it starts on the notice instead and never leaves it.
  const [state, setState] = useState<SigningState>(DOCUSIGN_LAUNCH_ENABLED ? "opening" : "idle");
  const [notice, setNotice] = useState<SigningNotice>(DOCUSIGN_LAUNCH_ENABLED ? "" : "paused");
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<EmbeddedSigningHandle | null>(null);
  // Refs rather than state for the two guards: a second tap in the same frame
  // sees them, where it would still see the state of the frame before.
  const openingRef = useRef(false);
  const settlingRef = useRef(false);
  // The ceremony is launched exactly once on arrival, whatever React's mount
  // lifecycle does (Strict Mode runs mount effects twice).
  const autoOpenedRef = useRef(false);

  const closeSession = useCallback(() => {
    sessionRef.current?.destroy();
    sessionRef.current = null;
  }, []);

  // DocuSign has said the session is over. Whatever it said, the backend
  // decides: completed continues, a final refusal is shown, anything else
  // returns the patient to the relaunch control to try again.
  const settle = useCallback(
    async (endedBy: SessionEndEvent["sessionEndType"]) => {
      if (settlingRef.current) return;
      settlingRef.current = true;
      setState("verifying");

      // A session that ended in a signature can run a moment ahead of the
      // envelope; one that ended any other way has nothing to wait for.
      const submissionId = sessionStorage.getItem("intake_submissionId") ?? "";
      const signed = endedBy === undefined || endedBy === "signing_complete";
      const outcome = submissionId
        ? await waitForAgreementCompletion(submissionId, { attempts: signed ? undefined : 1 })
        : "pending";
      closeSession();

      if (outcome === "completed") {
        posthog.capture("agreement_signing_completed");
        router.replace(`/${locale}/intake/dashboard`);
        return;
      }

      posthog.capture("agreement_signing_not_completed", {
        outcome,
        ended_by: endedBy ?? "return_message",
      });
      settlingRef.current = false;
      openingRef.current = false;
      setNotice(outcome === "declined" || endedBy === "decline" ? "declined" : "");
      setState("idle");
    },
    [closeSession, locale, router]
  );

  const openSigning = useCallback(async () => {
    if (openingRef.current) return;
    openingRef.current = true;
    posthog.capture("agreement_signing_open_requested");
    setNotice("");
    setState("opening");

    const submissionId = sessionStorage.getItem("intake_submissionId") ?? "";
    if (!submissionId) {
      posthog.capture("agreement_signing_unavailable", { reason: "missing_submission_id" });
      router.push(`/${locale}/intake/phone`);
      return;
    }

    try {
      // `locale` is the current URL locale — the patient's live language choice —
      // so a switch before signing is what selects the retainer, not a value
      // captured earlier in the flow.
      const result = await createAgreement(submissionId, locale);

      if (!result.ok) {
        // The case is not waiting for a signature — still in review, turned
        // down, or moved on. The dashboard shows where it stands.
        if (result.code === "case_not_approved") {
          posthog.capture("agreement_signing_unavailable", { reason: "case_not_approved" });
          router.replace(`/${locale}/intake/dashboard`);
          return;
        }

        // Signing needs a phone-verified patient and an accepted case, so any
        // other refusal is never something the patient can correct themselves.
        openingRef.current = false;
        posthog.capture("agreement_signing_unavailable", { reason: result.code });
        setNotice(result.code === "signing_capacity_exceeded" ? "capacity" : "unavailable");
        setState("idle");
        return;
      }

      // Already signed — nothing left to present.
      if (!result.signingUrl) {
        posthog.capture("agreement_signing_completed");
        router.replace(`/${locale}/intake/dashboard`);
        return;
      }

      if (!result.embed || !containerRef.current) {
        openingRef.current = false;
        posthog.capture("agreement_signing_unavailable", { reason: "missing_embed_payload" });
        setNotice("unavailable");
        setState("idle");
        return;
      }

      sessionRef.current = await startEmbeddedSigning({
        scriptUrl: result.embed.scriptUrl,
        integrationKey: result.embed.integrationKey,
        signingUrl: result.signingUrl,
        container: containerRef.current,
        onReady: () => {
          posthog.capture("agreement_signing_opened");
          setState("signing");
        },
        onSessionEnd: (event) => void settle(event.sessionEndType),
      });
    } catch {
      closeSession();
      openingRef.current = false;
      posthog.capture("agreement_signing_unavailable", { reason: "request_failed" });
      setNotice("unavailable");
      setState("idle");
    }
  }, [closeSession, locale, router, settle]);

  // The return route loads inside the ceremony's frame when DocuSign redirects
  // to it; it hands the session's end over to this screen rather than
  // navigating on its own.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if ((event.data as { type?: string } | null)?.type !== AGREEMENT_RETURN_MESSAGE) return;
      void settle(undefined);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [settle]);

  // Open the ceremony as soon as the screen is reached, exactly once. The guard
  // survives Strict Mode's mount/cleanup/mount, and openSigning's own guard
  // keeps createAgreement to a single in-flight call, so no duplicate envelope.
  useEffect(() => {
    if (!DOCUSIGN_LAUNCH_ENABLED || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    void openSigning();
  }, [openSigning]);

  useEffect(() => () => closeSession(), [closeSession]);

  const leaveSigning = () => {
    posthog.capture("agreement_signing_closed");
    closeSession();
    openingRef.current = false;
    settlingRef.current = false;
    setState("idle");
  };

  // Continue relaunches the ceremony; while the launch is off it returns the
  // patient to the dashboard, and nothing is created for it.
  const handleContinue = () => {
    if (!DOCUSIGN_LAUNCH_ENABLED) {
      router.push(`/${locale}/intake/dashboard`);
      return;
    }
    void openSigning();
  };

  const signingOpen = state !== "idle";

  return (
    <div className="relative h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      {/* The same header as the frames either side of this step (1968:2832,
          1968:3072); the ceremony's sheet covers it while signing is open. */}
      <ScreenHeader showLanguageSelector={false} />

      {/* No agreement presentation: the ceremony opens on arrival and covers
          this surface. It is only seen if the patient closes the ceremony or it
          cannot start, when it offers a relaunch — never a mock of the document. */}
      <main
        className="flex flex-1 flex-col items-center justify-center gap-[16px] px-[24px] text-center"
        aria-hidden={signingOpen}
      >
        {/* Only the relaunch control lives here; while the ceremony is open the
            overlay covers this surface and carries its own status note. */}
        {state === "idle" && (
          <>
            {notice && (
              <p
                className="text-[14px] text-[#cc007e]"
                role="alert"
              >
                {t(NOTICE_COPY[notice])}
              </p>
            )}
            <button
              type="button"
              onClick={handleContinue}
              className="h-[56px] w-full max-w-[337px] rounded-[16px] bg-brand px-[24px] text-[16px] font-semibold text-white"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("continue")}
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = SUPPORT_PHONE_TEL;
              }}
              className="text-[14px] font-semibold leading-[15px] text-[#58585c] underline"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("speakToSomeone")}
            </button>
          </>
        )}
      </main>

      {/* DocuSign's ceremony is shown on top of this screen rather than
          replacing it: the application stays the page the patient is on and the
          browser never navigates to a DocuSign-hosted document. DocuSign renders
          its own controls inside the sheet — consent, Adopt and Sign, Submit. */}
      {/* The container stays mounted so the library always has a node to mount
          into; the dialog semantics are attached only while it is open, so the
          closed overlay is absent from the accessibility tree, not just hidden. */}
      <div
        className={`absolute inset-0 z-[70] flex-col ${signingOpen ? "flex" : "hidden"}`}
        role={signingOpen ? "dialog" : undefined}
        aria-modal={signingOpen ? true : undefined}
        aria-label={signingOpen ? t("heading") : undefined}
        aria-hidden={signingOpen ? undefined : true}
      >
        {/* The dimmed screen shows through above the sheet */}
        <div
          className="absolute inset-0 bg-black/50"
          aria-hidden="true"
        />
        <div className="relative mt-[48px] flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[20px] bg-white">
          {/* A grabber and a close control: DocuSign brands the ceremony itself. */}
          <div className="relative flex shrink-0 items-center justify-center border-b border-[#e5e7eb] px-[20px] py-[12px]">
            <span
              className="h-[4px] w-[36px] rounded-full bg-[#e5e7eb]"
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={leaveSigning}
              aria-label={t("close")}
              className="absolute right-[12px] top-1/2 flex h-[28px] w-[28px] -translate-y-1/2 items-center justify-center rounded-full text-[#58585c]"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* DocuSign's ceremony fills the sheet; the status note sits over it until it is ready */}
          <div className="relative min-h-0 w-full flex-1">
            <div
              ref={containerRef}
              data-testid="signing-container"
              className="h-full w-full"
            />
            {state !== "signing" && (
              <p
                className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-[24px] text-center text-[14px] text-[#4d4d4d]"
                style={{ fontFamily: "var(--font-inter)" }}
                role="status"
              >
                {t(state === "verifying" ? "finalizing" : "opening")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
