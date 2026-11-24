"use client";

import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IntakeHeader } from "@/components/intake/intake-header";
import Image from "next/image";

export default function LawyerOnboardingSuccessPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("OnboardingLawyerSuccess");

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <IntakeHeader />

      <div className="flex-1 flex flex-col items-center justify-center gap-[32px] px-[24px]">
        <div className="relative size-[100px] rounded-full border-[3px] border-[#cc007e] overflow-hidden">
          <Image
            src="/assets/logo/favicon.svg"
            alt="Success"
            fill
            className="object-cover"
          />
        </div>

        <div className="flex flex-col gap-[12px] items-center text-center w-full">
          <h1
            className="text-[22px] font-bold text-[#212426] leading-normal w-full"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("heading")}
          </h1>
          <p className="text-[16px] text-[#7a828a] font-normal leading-[1.4] w-full">{t("subtext")}</p>
        </div>
      </div>

      <div className="px-[24px] pb-[68px]">
        <button
          onClick={() => router.push(`/${locale}/portal/dashboard`)}
          className="w-full h-[56px] bg-[#cc007e] rounded-[16px] text-white text-[16px] font-semibold"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("cta")}
        </button>
      </div>
    </div>
  );
}
