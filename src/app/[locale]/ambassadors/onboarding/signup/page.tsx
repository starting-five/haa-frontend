"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AmbassadorOnboardingSignupPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${locale}/ambassadors/onboarding/phone`);
  }, [locale, router]);

  return null;
}
