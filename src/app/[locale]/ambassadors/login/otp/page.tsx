"use client";

import { OtpScreen } from "@/components/otp/otp-screen";
import { formatUSPhone } from "@/components/phone/phone-screen";
import { type OtpStatus } from "@/components/otp/otp-screen";
import { classifyOtpSendError } from "@/lib/auth-otp-errors";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function AmbassadorsLoginOtpPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("Otp");
  const tLogin = useTranslations("PatientLogin");
  const [phone, setPhone] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [status, setStatus] = useState<OtpStatus>("idle");
  const [error, setError] = useState("");

  type AvailabilityPayload = { available?: boolean; reason?: string } | null;

  const isRegisteredAmbassador = useCallback(async (value: string) => {
    try {
      const response = await fetch("/api/ambassadors/phone-availability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone: value }),
      });

      const data = (await response.json().catch(() => null)) as AvailabilityPayload;
      const isTaken = data?.available === false && data.reason === "taken";

      if (isTaken) return "registered" as const;
      if (data?.available === true) return "notRegistered" as const;
      return "checkFailed" as const;
    } catch {
      return "checkFailed" as const;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const supabase = createClient();

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        if (data.session) {
          const sessionPhone = data.session.user.phone ?? "";
          if (!sessionPhone) {
            void supabase.auth.signOut({ scope: "local" });
            setError(tLogin("notRegistered"));
            setCheckingSession(false);
            return;
          }

          void isRegisteredAmbassador(sessionPhone).then((status) => {
            if (cancelled) return;
            if (status === "registered") {
              router.replace(`/${locale}/ambassadors/dashboard`);
              return;
            }
            if (status === "checkFailed") {
              setError(tLogin("registrationCheckFailed"));
            } else {
              setError(tLogin("notRegistered"));
            }
            void supabase.auth.signOut({ scope: "local" });
            setCheckingSession(false);
          });
          return;
        }

        const storedPhone = sessionStorage.getItem("ambassadors_login_phone") ?? "";
        if (!storedPhone) {
          router.replace(`/${locale}/ambassadors/login`);
          return;
        }
        setPhone(storedPhone);
        setCheckingSession(false);
      })
      .catch(() => {
        if (!cancelled) setCheckingSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isRegisteredAmbassador, locale, router, tLogin]);

  const displayPhone = formatUSPhone(phone.replace(/\D/g, "").slice(-10));

  const handleVerify = async (code: string) => {
    if (!phone) {
      setError(tLogin("otpError"));
      return;
    }

    setError("");
    setStatus("verifying");

    try {
      const supabase = createClient();
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        phone,
        token: code,
        type: "sms",
      });

      if (verifyError || !data.session) {
        setStatus("idle");
        setError(verifyError ? t("invalidCode") : tLogin("otpError"));
        return;
      }

      const registration = await isRegisteredAmbassador(phone);
      if (registration !== "registered") {
        await supabase.auth.signOut({ scope: "local" });
        sessionStorage.removeItem("ambassadors_login_phone");
        setStatus("idle");
        setError(registration === "checkFailed" ? tLogin("registrationCheckFailed") : tLogin("notRegistered"));
        return;
      }

      sessionStorage.removeItem("ambassadors_login_phone");
      router.replace(`/${locale}/ambassadors/dashboard`);
    } catch {
      setStatus("idle");
      setError(tLogin("otpError"));
    }
  };

  const handleChangePhone = () => {
    router.push(`/${locale}/ambassadors/login`);
  };

  const handleResend = async () => {
    if (!phone) {
      setError(tLogin("otpSendFailed"));
      return;
    }

    setError("");
    setStatus("sending");

    const supabase = createClient();
    const { error: resendError } = await supabase.auth.signInWithOtp({ phone });

    setStatus("idle");
    if (resendError) {
      switch (classifyOtpSendError(resendError)) {
        case "rateLimited":
          setError(tLogin("otpRateLimited"));
          break;
        case "smsUnavailable":
          setError(tLogin("otpSmsUnavailable"));
          break;
        default:
          setError(tLogin("otpSendFailed"));
      }
    }
  };

  if (checkingSession) return <div className="h-dvh w-full bg-white" />;

  return (
    <OtpScreen
      phone={displayPhone}
      onVerify={handleVerify}
      onChangePhone={handleChangePhone}
      onResend={handleResend}
      status={status}
      error={error}
    />
  );
}
