"use client";

// import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PhoneScreen } from "@/components/phone/phone-screen";
// import { createClient } from "@/lib/supabase/client";

export default function LawyerOnboardingPhonePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("OnboardingLawyerPhone");
  // const [loading, setLoading] = useState(false);
  // const [error, setError] = useState("");
  //
  const handleContinue = async (phone: string, email: string) => {
    // setLoading(true);
    // setError("");
    // const supabase = createClient();
    // const { error: otpError } = await supabase.auth.signInWithOtp({ phone });
    // setLoading(false);
    // if (otpError) {
    //   setError(otpError.message);
    //   return;
    // }
    sessionStorage.setItem("onboarding_phone", phone);
    if (email) sessionStorage.setItem("onboarding_email", email);
    router.push(`/${locale}/onboarding/lawyer/otp`);
  };

  return (
    <PhoneScreen
      heading={t("heading")}
      onContinue={handleContinue}
      // loading={loading}
      // error={error}
    />
  );
}
