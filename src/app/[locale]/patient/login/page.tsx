"use client";

import { PhoneScreen } from "@/components/phone/phone-screen";
import { classifyOtpSendError } from "@/lib/auth-otp-errors";
import { resumeAbandonedIntake } from "@/lib/intake-resume";
import { sessionPhoneE164 } from "@/lib/session-phone";
import { hasIntakeResumeDraftFor } from "@/lib/intake-session";
import { createClient } from "@/lib/supabase/client";
import { OTP_SESSION_KEYS, startOtpSession } from "@/lib/otp-session";
import { getPatientDashboard, PatientDashboardUnavailableError } from "@/services/intake";
import { getRegistrationStatus } from "@/services/intake";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function PatientLoginPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("PatientLogin");
  const [checkingSession, setCheckingSession] = useState(true);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [error, setError] = useState("");
  // The number has no submitted case. Login has nothing to show it, but the
  // intake does: a new patient starts there, and one who stopped part-way is put
  // back into the case they began, so that is the way forward offered.
  const [notRegistered, setNotRegistered] = useState(false);

  const isRegisteredPatient = useCallback(async (phone: string) => {
    const result = await getRegistrationStatus(phone);
    if (!result.ok) return "checkFailed" as const;
    return result.status === "existing" ? ("registered" as const) : ("notRegistered" as const);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const supabase = createClient();

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        if (data.session) {
          const sessionPhone = sessionPhoneE164(data.session.user.phone);
          const sessionUserId = data.session.user.id;
          if (!sessionPhone) {
            void supabase.auth.signOut({ scope: "local" });
            setError(t("notRegistered"));
            setCheckingSession(false);
            return;
          }

          void isRegisteredPatient(sessionPhone).then((status) => {
            if (cancelled) return;

            if (status === "checkFailed") {
              setError(t("registrationCheckFailed"));
              setCheckingSession(false);
              return;
            }

            if (status === "notRegistered") {
              // Signed in with no submitted case: a patient who passed OTP and
              // stopped part-way is put back into their intake. Anyone else — a
              // number that never started one, an ambassador-only account — is
              // not a registered patient, as before.
              void resumeAbandonedIntake(sessionStorage, locale, {
                userId: sessionUserId,
                phone: sessionPhone,
                email: data.session?.user.email,
                userMetadata: data.session?.user.user_metadata,
              }).then((outcome) => {
                if (cancelled) return;
                if (outcome.kind === "resume") {
                  router.replace(outcome.path);
                  return;
                }
                if (outcome.kind === "failed") {
                  setError(t("registrationCheckFailed"));
                  setCheckingSession(false);
                  return;
                }
                void supabase.auth.signOut({ scope: "local" });
                setError(t("notRegistered"));
                setNotRegistered(true);
                setCheckingSession(false);
              });
              return;
            }

            void getPatientDashboard()
              .then(() => {
                if (!cancelled) router.replace(`/${locale}/intake/dashboard`);
              })
              .catch((error) => {
                if (
                  !cancelled &&
                  error instanceof PatientDashboardUnavailableError &&
                  error.code === "intake_incomplete"
                ) {
                  router.replace(`/${locale}/intake`);
                  return;
                }
                if (!cancelled) setCheckingSession(false);
              });
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
  }, [isRegisteredPatient, locale, router, t]);

  const initialPhone = typeof window !== "undefined" ? (sessionStorage.getItem("patient_login_phone") ?? "") : "";

  const handleContinue = async (phone: string) => {
    setError("");
    setNotRegistered(false);
    setSendingOtp(true);

    try {
      const registration = await isRegisteredPatient(phone);
      if (registration === "checkFailed") {
        setError(t("registrationCheckFailed"));
        return;
      }
      // A number with no submitted case gets a code only when this tab kept the
      // intake it verified and abandoned; the code screen then resumes it.
      if (registration === "notRegistered" && !hasIntakeResumeDraftFor(sessionStorage, phone)) {
        setError(t("notRegistered"));
        setNotRegistered(true);
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

      // the code is out: this is when its ten minutes start, and the OTP
      // screen reads it back so leaving and returning does not reset them
      startOtpSession(OTP_SESSION_KEYS.patientLogin, phone);
      sessionStorage.setItem("patient_login_phone", phone);
      router.push(`/${locale}/patient/login/otp`);
    } catch {
      setError(t("otpSendFailed"));
    } finally {
      setSendingOtp(false);
    }
  };

  const handleStartIntake = () => {
    router.push(`/${locale}/intake`);
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
      secondaryLabel={notRegistered ? t("startIntake") : undefined}
      onSecondaryClick={handleStartIntake}
      showSmsDisclaimer
      showEmail={false}
      showStatusBar={false}
      focusBorderColor="#CC007E"
      focusBorderWidth="1px"
    />
  );
}
