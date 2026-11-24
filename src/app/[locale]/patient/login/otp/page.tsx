"use client";

import { OtpScreen } from "@/components/otp/otp-screen";
import { formatUSPhone } from "@/components/phone/phone-screen";
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
import { resumeAbandonedIntake } from "@/lib/intake-resume";
import { sessionPhoneE164 } from "@/lib/session-phone";
import { createClient } from "@/lib/supabase/client";
import { getPatientDashboard, PatientDashboardUnavailableError } from "@/services/intake";
import { getRegistrationStatus } from "@/services/intake";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function PatientLoginOtpPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("Otp");
  const tLogin = useTranslations("PatientLogin");
  const [phone, setPhone] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [status, setStatus] = useState<OtpStatus>("idle");
  const [error, setError] = useState("");
  // the send that opened this window, adopted only when it belongs to the
  // number on screen, so an old number's window cannot be inherited
  const [session, setSession] = useState<OtpSession | null>(null);

  const isRegisteredPatient = useCallback(async (value: string) => {
    const result = await getRegistrationStatus(value);
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
            setError(tLogin("notRegistered"));
            setCheckingSession(false);
            return;
          }

          void isRegisteredPatient(sessionPhone).then((status) => {
            if (cancelled) return;

            if (status === "checkFailed") {
              setError(tLogin("registrationCheckFailed"));
              setCheckingSession(false);
              return;
            }

            if (status === "notRegistered") {
              // only a patient who passed OTP and abandoned the intake goes back
              // into it; anyone else is not a registered patient, as before
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
                  setError(tLogin("registrationCheckFailed"));
                  setCheckingSession(false);
                  return;
                }
                void supabase.auth.signOut({ scope: "local" });
                setError(tLogin("notRegistered"));
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

        const storedPhone = sessionStorage.getItem("patient_login_phone") ?? "";
        if (!storedPhone) {
          router.replace(`/${locale}/patient/login`);
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
  }, [isRegisteredPatient, locale, router, tLogin]);

  // A session is only ever adopted when it belongs to the number on screen, so
  // a window opened for a previous number cannot be inherited here.
  useEffect(() => {
    if (!phone) return;
    setSession(readOtpSession(OTP_SESSION_KEYS.patientLogin, phone));
    setError("");
    setStatus("idle");
  }, [phone]);

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
        const failure = classifyOtpVerifyError(verifyError, {
          sentAt: session?.sentAt ?? null,
          expirySeconds: OTP_EXPIRY_SECONDS,
        });
        setError(t(OTP_VERIFY_MESSAGE_KEYS[failure]));
        return;
      }

      // Verified as this account: anything the tab still holds for another one —
      // a deleted account's case id, its submitted marker — goes now.
      claimIntakeForUser(sessionStorage, data.session.user.id, { keepEnteredIdentity: false });

      const registration = await isRegisteredPatient(phone);
      if (registration === "notRegistered") {
        // Verified, with no submitted case: a patient who stopped part-way
        // through the intake is put back into it.
        const outcome = await resumeAbandonedIntake(sessionStorage, locale, {
          userId: data.session.user.id,
          phone: data.session.user.phone ?? phone,
          email: data.session.user.email,
          userMetadata: data.session.user.user_metadata,
        });
        if (outcome.kind === "resume") {
          clearOtpSession(OTP_SESSION_KEYS.patientLogin);
          sessionStorage.removeItem("patient_login_phone");
          router.replace(outcome.path);
          return;
        }
        await supabase.auth.signOut({ scope: "local" });
        sessionStorage.removeItem("patient_login_phone");
        setStatus("idle");
        setError(outcome.kind === "failed" ? tLogin("registrationCheckFailed") : tLogin("notRegistered"));
        return;
      }
      if (registration !== "registered") {
        await supabase.auth.signOut({ scope: "local" });
        sessionStorage.removeItem("patient_login_phone");
        setStatus("idle");
        setError(tLogin("registrationCheckFailed"));
        return;
      }

      await getPatientDashboard();
      clearOtpSession(OTP_SESSION_KEYS.patientLogin);
      sessionStorage.removeItem("patient_login_phone");
      router.replace(`/${locale}/intake/dashboard`);
    } catch (error) {
      if (error instanceof PatientDashboardUnavailableError && error.code === "intake_incomplete") {
        sessionStorage.removeItem("patient_login_phone");
        router.replace(`/${locale}/intake`);
        return;
      }
      setStatus("idle");
      // a dropped connection is not a bad code, and saying so sends the patient
      // round a loop they cannot win by retyping
      if (isNetworkFailure(error)) {
        setError(t("verifyNetwork"));
        return;
      }
      setError(tLogin("otpError"));
    }
  };

  const handleChangePhone = () => {
    // the window belonged to the number being abandoned
    clearOtpSession(OTP_SESSION_KEYS.patientLogin);
    router.push(`/${locale}/patient/login`);
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
      return;
    }

    // only a send the provider accepted opens a new window
    setSession(startOtpSession(OTP_SESSION_KEYS.patientLogin, phone));
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
      expiresAt={otpExpiresAt(session, OTP_EXPIRY_SECONDS)}
    />
  );
}
