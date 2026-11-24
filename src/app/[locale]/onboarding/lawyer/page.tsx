"use client";

import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IntakeHeader } from "@/components/intake/intake-header";

export default function LawyerOnboardingWelcomePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("OnboardingLawyerWelcome");

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <IntakeHeader />

      {/* Hero content */}
      <div className="flex-1 flex flex-col items-center justify-center px-[24px] gap-[12px]">
        <h1
          className="text-[36px] font-extrabold text-[#090909] leading-[1.2] text-center w-full whitespace-pre-line"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("headline")}
        </h1>
        <p
          className="text-[16px] font-normal text-black text-center w-full"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("subtext")}
        </p>
      </div>

      {/* CTA */}
      <div className="px-[24px] pb-[68px]">
        <button
          type="button"
          onClick={() => router.push(`/${locale}/onboarding/lawyer/name`)}
          className="w-full h-[56px] bg-[#cc007e] rounded-[16px] text-white text-[16px] font-semibold"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("cta")}
        </button>
      </div>
    </div>
  );
}
