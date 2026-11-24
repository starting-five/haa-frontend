"use client";

import { PhoneScreen } from "@/components/phone/phone-screen";
import { classifyOtpSendError } from "@/lib/auth-otp-errors";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function AmbassadorsLoginPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("PatientLogin");
  const [checkingSession, setCheckingSession] = useState(true);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [error, setError] = useState("");

  type AvailabilityPayload = { available?: boolean; reason?: string } | null;

  const isRegisteredAmbassador = useCallback(async (phone: string) => {
    try {
      const response = await fetch("/api/ambassadors/phone-availability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone }),
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
            setError(t("notRegistered"));
            setCheckingSession(false);
            return;
          }

          void isRegisteredAmbassador(sessionPhone).then((status) => {
            if (cancelled) return;

            if (status === "checkFailed") {
              setError(t("registrationCheckFailed"));
              setCheckingSession(false);
              return;
            }

            if (status === "notRegistered") {
              void supabase.auth.signOut({ scope: "local" });
              setError(t("notRegistered"));
              setCheckingSession(false);
              return;
            }

            router.replace(`/${locale}/ambassadors/dashboard`);
          });
          return;
        }
        setCheckingSession(false);
      })
      .catch(() => {
        if (!cancelled) setCheckingSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isRegisteredAmbassador, locale, router, t]);

  const initialPhone = typeof window !== "undefined" ? (sessionStorage.getItem("ambassadors_login_phone") ?? "") : "";

  const handleContinue = async (phone: string) => {
    setError("");
    setSendingOtp(true);

    try {
      const registration = await isRegisteredAmbassador(phone);
      if (registration === "checkFailed") {
        setError(t("registrationCheckFailed"));
        return;
      }
      if (registration === "notRegistered") {
        setError(t("notRegistered"));
        return;
      }

      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({ phone });

      if (otpError) {
        switch (classifyOtpSendError(otpError)) {
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

      sessionStorage.setItem("ambassadors_login_phone", phone);
      router.push(`/${locale}/ambassadors/login/otp`);
    } catch {
      setError(t("otpSendFailed"));
    } finally {
      setSendingOtp(false);
    }
  };

  if (checkingSession) return <div className="h-dvh w-full bg-white" />;

  return (
    <PhoneScreen
      showLanguageSelector={false}
      heading={t("heading")}
      subtext={t("phoneSubtext")}
      onContinue={handleContinue}
      initialPhone={initialPhone}
      loading={sendingOtp}
      error={error}
      showSmsDisclaimer
      showEmail={false}
      showStatusBar={false}
      focusBorderColor="#CC007E"
      focusBorderWidth="1px"
    />
  );
}
