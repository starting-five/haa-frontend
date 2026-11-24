"use client";

import { OtpScreen } from "@/components/otp/otp-screen";
import { formatUSPhone } from "@/components/phone/phone-screen";
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
import { classifyOtpSendError, classifyOtpVerifyError, OTP_VERIFY_MESSAGE_KEYS } from "@/lib/auth-otp-errors";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AmbassadorOnboardingOtpPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("Otp");
  const [status, setStatus] = useState<OtpStatus>("idle");
  const [error, setError] = useState("");
  // the send that opened the ten-minute window, adopted only when it belongs to
  // the number on screen
  const [session, setSession] = useState<OtpSession | null>(null);

  useRequireSessionKey("onboarding_ambassador_phone", "/ambassadors/onboarding/phone");

  // starts empty for hydration safety and syncs from session storage after mount.
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  useEffect(() => {
    setPhone(sessionStorage.getItem("onboarding_ambassador_phone") ?? "");
    setEmail((sessionStorage.getItem("onboarding_ambassador_email") ?? "").trim().toLowerCase());
  }, []);

  // A session is only ever adopted when it belongs to the number on screen, so
  // a window opened for a previous number cannot be inherited here.
  useEffect(() => {
    if (!phone) return;
    setSession(readOtpSession(OTP_SESSION_KEYS.ambassador, phone));
    setError("");
    setStatus("idle");
  }, [phone]);

  const expiresAt = otpExpiresAt(session, OTP_EXPIRY_SECONDS);

  const displayPhone = formatUSPhone(phone.replace(/\D/g, "").slice(-10));

  const handleVerify = async (code: string) => {
    if (!phone) {
      setError(t("verificationFailed"));
      return;
    }

    setError("");
    setStatus("verifying");

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
      setError(t(OTP_VERIFY_MESSAGE_KEYS[failure]));
      return;
    }

    router.push(`/${locale}/ambassadors/onboarding/link`);
  };

  const handleChangePhone = () => {
    // the window belonged to the number being abandoned
    clearOtpSession(OTP_SESSION_KEYS.ambassador);
    router.push(`/${locale}/ambassadors/onboarding/phone`);
  };

  const handleResend = async () => {
    if (!phone) {
      setError(t("resendFailed"));
      return;
    }

    setError("");
    setStatus("sending");

    const supabase = createClient();
    const { error: resendError } = await supabase.auth.signInWithOtp({
      phone,
      ...(email
        ? {
            options: {
              data: {
                email,
              },
            },
          }
        : {}),
    });

    setStatus("idle");
    if (resendError) {
      // Same send endpoint as the phone screen, so the same distinctions apply:
      // "try again" is wrong advice for a rate limit and for a project with no
      // SMS provider configured.
      switch (classifyOtpSendError(resendError)) {
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

    // only a send the provider accepted restarts the ten minutes
    setSession(startOtpSession(OTP_SESSION_KEYS.ambassador, phone));
  };

  return (
    <OtpScreen
      variant="ambassador"
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
