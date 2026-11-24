"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OtpScreen } from "@/components/otp/otp-screen";
import { formatUSPhone } from "@/components/phone/phone-screen";

export default function LawyerOnboardingOtpPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const [loading] = useState(false);
  const [error] = useState("");

  // starts empty (matching SSR) and synced from sessionStorage after mount to avoid a hydration mismatch
  const [phone, setPhone] = useState("");
  useEffect(() => {
    setPhone(sessionStorage.getItem("onboarding_phone") ?? "");
  }, []);

  const displayPhone = formatUSPhone(phone.replace(/\D/g, "").slice(-10));

  const handleVerify = async (_code: string) => {
    // setLoading(true);
    // setError("");
    // const supabase = createClient();
    // const { error: verifyError } = await supabase.auth.verifyOtp({
    //   phone,
    //   token: code,
    //   type: "sms",
    // });
    // setLoading(false);
    // if (verifyError) {
    //   setError(verifyError.message);
    //   return;
    // }
    router.push(`/${locale}/onboarding/lawyer/success`);
  };

  const handleChangePhone = () => {
    router.push(`/${locale}/onboarding/lawyer/phone`);
  };

  const handleResend = async () => {
    // const supabase = createClient();
    // await supabase.auth.signInWithOtp({ phone });
  };

  return (
    <OtpScreen
      phone={displayPhone}
      onVerify={handleVerify}
      onChangePhone={handleChangePhone}
      onResend={handleResend}
      status={loading ? "verifying" : "idle"}
      error={error}
    />
  );
}
