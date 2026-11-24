"use client";

import { OtpScreen } from "@/components/otp/otp-screen";
import { formatUSPhone } from "@/components/phone/phone-screen";
import { usePreloadImages } from "@/hooks/use-preload-images";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { type OtpStatus } from "@/components/otp/otp-screen";
import {
  clearOtpSession,
  OTP_EXPIRY_SECONDS,
  otpExpiresAt,
  OTP_SESSION_KEYS,
  readOtpSession,
  startOtpSession,
  type OtpSession,
} from "@/lib/otp-session";
import {
  classifyOtpSendError,
  classifyOtpVerifyError,
  isNetworkFailure,
  OTP_VERIFY_MESSAGE_KEYS,
} from "@/lib/auth-otp-errors";
import { claimIntakeForUser } from "@/lib/intake-session";
import { createClient } from "@/lib/supabase/client";
import { startIntake } from "@/services/intake";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useEffect, useState } from "react";

// Verification lands on the Verified interstitial, which draws the brand mark.
const NEXT_SCREEN_IMAGES = ["/assets/logo/favicon.svg"] as const;

export default function IntakeOtpPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("Otp");
  const tSubmit = useTranslations("SubmitError");
  const [status, setStatus] = useState<OtpStatus>("idle");
  const [error, setError] = useState("");
  // the send that opened this window, read back from the session so the
  // countdown and the expiry check survive leaving the screen and returning
  const [session, setSession] = useState<OtpSession | null>(null);

  useRequireSessionKey("intake_phone", "/intake/phone");
  usePreloadImages(NEXT_SCREEN_IMAGES);

  // starts empty (matching SSR) and synced from sessionStorage after mount to avoid a hydration mismatch
  const [phone, setPhone] = useState("");
  useEffect(() => {
    setPhone(sessionStorage.getItem("intake_phone") ?? "");
  }, [locale]);

  // A session is only ever adopted when it belongs to the number on screen, so
  // a window opened for a previous number cannot be inherited here.
  useEffect(() => {
    if (!phone) return;
    setSession(readOtpSession(OTP_SESSION_KEYS.intake, phone));
    setError("");
    setStatus("idle");
  }, [phone]);

  const expiresAt = otpExpiresAt(session, OTP_EXPIRY_SECONDS);

  // stored as E.164; shown the way the patient typed it on the previous screen
  const displayPhone = formatUSPhone(phone.replace(/\D/g, "").slice(-10));

  const handleVerify = async (code: string) => {
    if (!phone) {
      posthog.capture("intake_otp_verify_failed", {
        flow: "patient_intake",
        locale,
        reason: "missing_phone",
      });
      setError(t("verificationFailed"));
      return;
    }

    posthog.capture("intake_otp_verify_requested", {
      flow: "patient_intake",
      locale,
    });
    setError("");
    setStatus("verifying");

    try {
      // Verification is handled by Supabase phone auth directly.
      const supabase = createClient();
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        phone,
        token: code,
        type: "sms",
      });

      if (verifyError || !data.session) {
        setStatus("idle");
        const failure = classifyOtpVerifyError(verifyError, {
          sentAt: session?.sentAt ?? null,
          expirySeconds: OTP_EXPIRY_SECONDS,
        });
        posthog.capture("intake_otp_verify_failed", {
          flow: "patient_intake",
          locale,
          reason: failure,
        });
        setError(t(OTP_VERIFY_MESSAGE_KEYS[failure]));
        return;
      }
      posthog.capture("intake_otp_verified", {
        flow: "patient_intake",
        locale,
      });

      // The case is opened the moment the number is verified, before a word has
      // been said about the crash. A patient who stops after this is still one
      // we know about, and the intake they abandoned is the one they resume.
      // The accident follows on a second call, from the location screen.
      // The tab becomes this account's. A case id or submitted marker another
      // account left here is dropped before startIntake; what was typed on the
      // screens before the code is this patient's and stays.
      claimIntakeForUser(sessionStorage, data.session.user.id, { keepEnteredIdentity: true });

      const claimantFirstName = (sessionStorage.getItem("intake_firstName") ?? "").trim();
      const claimantLastName = (sessionStorage.getItem("intake_lastName") ?? "").trim();
      const claimantEmail = (sessionStorage.getItem("intake_email") ?? "").trim() || undefined;

      if (!claimantFirstName || !claimantLastName) {
        posthog.capture("intake_submission_create_failed", {
          flow: "patient_intake",
          locale,
          reason: "missing_claimant_name",
        });
        setStatus("idle");
        setError(tSubmit("description"));
        return;
      }

      // No accident. The patient has not been asked about the crash yet — the
      // incident screens come after this one — and inventing answers to satisfy
      // the call would leave a case that names a type, a place and a date the
      // patient never gave. It is sent from the location screen instead.
      const result = await startIntake({
        locale,
        claimant: {
          firstName: claimantFirstName,
          lastName: claimantLastName,
          mobile: phone,
          email: claimantEmail,
        },
      });

      // The code screen is spent once it has verified: replacing it keeps Back
      // on the next screen pointing at the phone number, not at a code that
      // would be re-submitted.
      if (result.existing) {
        posthog.capture("intake_existing_submission_routed_dashboard", {
          flow: "patient_intake",
          locale,
        });
        // Returning patient — their case is already submitted, and this tab has no
        // id for it, so attorney matching could only send them round to the phone
        // screen. They are signed in now; the dashboard is where their case is, and
        // where patient login takes them too.
        clearOtpSession(OTP_SESSION_KEYS.intake);
        router.replace(`/${locale}/intake/dashboard`);
        return;
      }

      clearOtpSession(OTP_SESSION_KEYS.intake);
      sessionStorage.setItem("intake_submissionId", result.submissionId);
      posthog.capture("intake_submission_created", {
        flow: "patient_intake",
        locale,
      });

      // Best-effort Dub lead attribution tied to the OTP-created submission.
      void fetch("/api/intake/dub-lead", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          submissionId: result.submissionId,
          locale,
          claimant: {
            firstName: claimantFirstName,
            lastName: claimantLastName,
            email: claimantEmail,
          },
        }),
      }).catch(() => {
        // Never block intake progression on tracking failures.
      });

      // The Verified interstitial sits between here and the first question
      // about the crash (Figma 4817:19579); it carries the flow on to the
      // accident screens by itself.
      router.replace(`/${locale}/intake/verified`);
    } catch (error) {
      posthog.capture("intake_submission_create_failed", {
        flow: "patient_intake",
        locale,
        reason: isNetworkFailure(error) ? "network_error" : "request_failed",
      });
      setStatus("idle");
      // A dropped connection is not a bad code, and telling the patient to check
      // their digits would send them round a loop they cannot win.
      if (isNetworkFailure(error)) {
        setError(t("verifyNetwork"));
        return;
      }
      const message = error instanceof Error ? error.message.trim() : "";
      setError(message || tSubmit("description"));
    }
  };

  const handleChangePhone = () => {
    // the window belonged to the number being abandoned
    clearOtpSession(OTP_SESSION_KEYS.intake);
    router.push(`/${locale}/intake/phone`);
  };

  const handleResend = async () => {
    if (!phone) {
      posthog.capture("intake_otp_resend_failed", {
        flow: "patient_intake",
        locale,
        reason: "missing_phone",
      });
      setError(t("resendFailed"));
      return;
    }

    posthog.capture("intake_otp_resend_requested", {
      flow: "patient_intake",
      locale,
    });
    setError("");
    setStatus("sending");

    const email = (sessionStorage.getItem("intake_email") ?? "").trim().toLowerCase();
    const firstName = (sessionStorage.getItem("intake_firstName") ?? "").trim();
    const lastName = (sessionStorage.getItem("intake_lastName") ?? "").trim();
    const supabase = createClient();
    const { error: resendError } = await supabase.auth.signInWithOtp({
      phone,
      ...(email
        ? {
            options: {
              data: {
                email,
                first_name: firstName,
                last_name: lastName,
              },
            },
          }
        : firstName || lastName
          ? {
              options: {
                data: {
                  first_name: firstName,
                  last_name: lastName,
                },
              },
            }
          : {}),
    });

    setStatus("idle");
    if (resendError) {
      const resendErrorType = classifyOtpSendError(resendError);
      posthog.capture("intake_otp_resend_failed", {
        flow: "patient_intake",
        locale,
        reason: resendErrorType,
      });
      switch (resendErrorType) {
        case "rateLimited":
          setError(t("resendRateLimited"));
          break;
        case "smsUnavailable":
          setError(t("resendSmsUnavailable"));
          break;
        default:
          setError(t("resendFailed"));
      }
      return;
    }

    // Only a send the provider accepted opens a new window. A refused one must
    // not pretend a code is out there, so the old session stands.
    posthog.capture("intake_otp_resent", {
      flow: "patient_intake",
      locale,
    });
    setSession(startOtpSession(OTP_SESSION_KEYS.intake, phone));
  };

  return (
    <OtpScreen
      phone={displayPhone}
      onVerify={handleVerify}
      onChangePhone={handleChangePhone}
      onResend={handleResend}
      status={status}
      error={error}
      expiresAt={expiresAt}
    />
  );
}
