"use client";

import { PhoneScreen } from "@/components/phone/phone-screen";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { classifyOtpSendError } from "@/lib/auth-otp-errors";
import { releaseStaleIntake } from "@/lib/intake-owner";
import { createClient } from "@/lib/supabase/client";
import { OTP_SESSION_KEYS, startOtpSession } from "@/lib/otp-session";
import { getRegistrationStatus } from "@/services/intake";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useEffect, useState } from "react";

export default function IntakePhonePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakePhone");

  useRequireSessionKey("intake_firstName", "/intake");

  // Coming back (Change number) shows what was entered before. Read in an effect
  // so the server render matches the first client one; the screen mounts only
  // once the values are known so its own state starts from them.
  const [initial, setInitial] = useState<{ phone: string; email: string } | null>(null);
  useEffect(() => {
    setInitial({
      phone: sessionStorage.getItem("intake_phone") ?? "",
      email: sessionStorage.getItem("intake_email") ?? "",
    });
  }, []);

  // The name screen lets go of another account's intake before anything is
  // shown; this checks again for a tab that came here without passing it (Back,
  // a reload), and clearing takes the name too, so the patient starts there.
  useEffect(() => {
    let cancelled = false;
    void releaseStaleIntake(sessionStorage).then((released) => {
      if (!cancelled && released) router.replace(`/${locale}/intake`);
    });
    return () => {
      cancelled = true;
    };
  }, [locale, router]);

  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  const handleContinue = async (phone: string, email: string) => {
    posthog.capture("intake_phone_submitted", {
      flow: "patient_intake",
      locale,
    });
    setError("");
    setAlreadyRegistered(false);
    setChecking(true);

    try {
      // The backend decides this, not the browser. Asking here rather than after
      // verification is the whole point: a patient who already has an account is
      // told before a code is sent and before anything is written, instead of
      // walking the new-patient flow and being recognised at the end of it.
      const result = await getRegistrationStatus(phone);

      if (!result.ok) {
        posthog.capture("intake_phone_check_failed", {
          flow: "patient_intake",
          locale,
        });
        // The check could not be made, so nothing has been established. Continuing
        // would send a patient down a flow this screen exists to keep them out of.
        setError(t("checkFailed"));
        return;
      }

      if (result.status === "existing") {
        posthog.capture("intake_existing_patient_detected", {
          flow: "patient_intake",
          locale,
        });
        // Handed to the login screen, which starts from it, so Sign In does not
        // ask for the number the patient has just typed.
        sessionStorage.setItem("patient_login_phone", phone);
        setAlreadyRegistered(true);
        return;
      }

      // For new claimants, send OTP before leaving this screen so the first
      // verify attempt can succeed without requiring a manual resend.
      const normalizedEmail = email.trim().toLowerCase();
      const firstName = (sessionStorage.getItem("intake_firstName") ?? "").trim();
      const lastName = (sessionStorage.getItem("intake_lastName") ?? "").trim();
      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone,
        ...(normalizedEmail
          ? {
              options: {
                data: {
                  email: normalizedEmail,
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

      if (otpError) {
        const sendErrorType = classifyOtpSendError(otpError);
        posthog.capture("intake_otp_send_failed", {
          flow: "patient_intake",
          locale,
          reason: sendErrorType,
        });
        switch (sendErrorType) {
          case "invalidPhone":
            return { phoneError: t("phoneInvalid") };
          case "rateLimited":
            setError(t("otpRateLimited"));
            return;
          case "smsUnavailable":
            setError(t("otpSmsUnavailable"));
            return;
          default:
            setError(t("otpSendFailed"));
            return;
        }
      }

      posthog.capture("intake_otp_sent", {
        flow: "patient_intake",
        locale,
      });
      // the code is out: this is when its ten minutes start, and the OTP
      // screen reads it back so leaving and returning does not reset them
      startOtpSession(OTP_SESSION_KEYS.intake, phone);
      sessionStorage.setItem("intake_phone", phone);
      // The address is optional (Figma 2079:3292). Clearing a previously entered
      // one has to remove it, not leave the old value behind for the submission
      // that follows, so an empty field always means no address on file.
      if (email) {
        sessionStorage.setItem("intake_email", email);
      } else {
        sessionStorage.removeItem("intake_email");
      }
      router.push(`/${locale}/intake/otp`);
    } catch {
      posthog.capture("intake_otp_send_failed", {
        flow: "patient_intake",
        locale,
        reason: "request_failed",
      });
      setError(t("otpSendFailed"));
    } finally {
      setChecking(false);
    }
  };

  // The number belongs to an account, so the way forward is the existing login
  // screen — not a second sign-in built into the intake flow.
  const handleSignIn = () => {
    posthog.capture("intake_existing_patient_sign_in_clicked", {
      flow: "patient_intake",
      locale,
    });
    router.push(`/${locale}/patient/login`);
  };

  if (!initial) return <div className="h-dvh w-full bg-white" />;

  return (
    <PhoneScreen
      showLanguageSelector={false}
      heading={t("heading")}
      subtext={t("subtext")}
      focusBorderColor="#CC007E"
      focusBorderWidth="1px"
      onContinue={handleContinue}
      initialPhone={initial.phone}
      initialEmail={initial.email}
      requireEmail={false}
      loading={checking}
      error={alreadyRegistered ? t("alreadyRegistered") : error}
      secondaryLabel={alreadyRegistered ? t("signIn") : undefined}
      onSecondaryClick={handleSignIn}
      showSmsDisclaimer
    />
  );
}
