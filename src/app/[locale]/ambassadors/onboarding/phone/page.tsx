"use client";

import { PhoneScreen } from "@/components/phone/phone-screen";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { classifyOtpSendError } from "@/lib/auth-otp-errors";
import { createClient } from "@/lib/supabase/client";
import { OTP_SESSION_KEYS, startOtpSession } from "@/lib/otp-session";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function AmbassadorOnboardingPhonePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("OnboardingAmbassadorPhone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useRequireSessionKey("onboarding_ambassador_username", "/ambassadors/onboarding/username");

  const initialPhone =
    typeof window !== "undefined" ? (sessionStorage.getItem("onboarding_ambassador_phone") ?? "") : "";
  const initialEmail =
    typeof window !== "undefined" ? (sessionStorage.getItem("onboarding_ambassador_email") ?? "") : "";

  type AvailabilityPayload = { available?: boolean; reason?: string } | null;

  // Phone availability must be ambassador-specific (ambassador_profiles), not a
  // generic profile-exists check, otherwise patient-only numbers are blocked.
  const checkPhoneAvailability = async (phone: string) => {
    try {
      const response = await fetch("/api/ambassadors/phone-availability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone }),
      });

      const data = (await response.json().catch(() => null)) as AvailabilityPayload;
      return data;
    } catch {
      return null;
    }
  };

  // Answers null for every way the lookup can fail — transport, proxy 502/503,
  // a non-JSON body — so the caller can say the check failed rather than
  // blaming the code it never got as far as sending.
  const checkEmailAvailability = async (email: string) => {
    try {
      const response = await fetch("/api/backend/ambassadors/contact-availability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = (await response.json().catch(() => null)) as AvailabilityPayload;
      return data;
    } catch {
      return null;
    }
  };

  const handleContinue = async (phone: string, email: string) => {
    setError("");
    setLoading(true);

    try {
      const phoneAvailability = await checkPhoneAvailability(phone);
      const phoneTaken = phoneAvailability?.available === false && phoneAvailability.reason === "taken";
      if (phoneTaken) {
        return { phoneError: t("phoneTaken") };
      }
      if (phoneAvailability?.available !== true) {
        setError(t("availabilityCheckFailed"));
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const emailAvailability = await checkEmailAvailability(normalizedEmail);
      const emailTaken = emailAvailability?.available === false && emailAvailability.reason === "taken";
      if (emailTaken) {
        return { emailError: t("emailTaken") };
      }
      if (emailAvailability?.available !== true) {
        setError(t("availabilityCheckFailed"));
        return;
      }

      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone,
        options: {
          data: {
            email: normalizedEmail,
          },
        },
      });

      if (otpError) {
        switch (classifyOtpSendError(otpError)) {
          // Nothing is wrong with the flow — the number itself was refused, so
          // it belongs against the field the caller can actually correct.
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

      // The code is already sent by this point, so a storage failure is not a
      // send failure. Saying "we couldn't send the code" here would be untrue
      // and would invite a retry that burns another message.
      try {
        sessionStorage.setItem("onboarding_ambassador_phone", phone);
        sessionStorage.setItem("onboarding_ambassador_email", email);
        sessionStorage.setItem("onboarding_ambassador_locale", locale);
      } catch {
        setError(t("sessionUnavailable"));
        return;
      }

      // the code is out: this is when its ten minutes start

      startOtpSession(OTP_SESSION_KEYS.ambassador, phone);

      router.push(`/${locale}/ambassadors/onboarding/otp`);
    } catch {
      setError(t("otpSendFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PhoneScreen
      heading={t("heading")}
      subtext={t("helperText")}
      onContinue={handleContinue}
      initialPhone={initialPhone}
      initialEmail={initialEmail}
      requireEmail
      showEmailValidationOnType
      showSmsDisclaimer
      focusBorderColor="#CC007E"
      focusBorderWidth="1px"
      emailFieldGapClassName="mt-[12px]"
      loading={loading}
      error={error}
    />
  );
}
