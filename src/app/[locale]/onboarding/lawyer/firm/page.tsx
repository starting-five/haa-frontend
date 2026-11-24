"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IntakeHeader } from "@/components/intake/intake-header";

export default function LawyerOnboardingFirmPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("OnboardingLawyerFirm");
  const tc = useTranslations("Common");

  const [firmName, setFirmName] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");

  const canContinue = firmName.trim().length > 0 && officeAddress.trim().length > 0;

  const handleContinue = () => {
    if (!canContinue) return;
    sessionStorage.setItem("onboarding_firmName", firmName.trim());
    sessionStorage.setItem("onboarding_officeAddress", officeAddress.trim());
    router.push(`/${locale}/onboarding/lawyer/role`);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col pb-[100px]">
      <IntakeHeader />

      <div className="flex-1 flex flex-col px-[24px] pt-[32px]">
        <h1
          className="text-[26px] font-bold text-[#111] leading-normal w-full"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>

        <div className="flex flex-col gap-[24px] w-full pt-[40px]">
          {/* Firm Name */}
          <div className="flex flex-col gap-[8px] w-full">
            <label className="text-[13px] text-[#6e6e73] font-medium">{t("firmName")}</label>
            <input
              type="text"
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
              className="w-full h-[48px] bg-white border border-[#e5e5e5] rounded-[10px] px-[16px] text-[16px] text-[#111] outline-none focus:border-[#cc007e]"
            />
          </div>

          {/* Office Address */}
          <div className="flex flex-col gap-[8px] w-full">
            <label className="text-[13px] text-[#6e6e73] font-medium">{t("officeAddress")}</label>
            <input
              type="text"
              value={officeAddress}
              onChange={(e) => setOfficeAddress(e.target.value)}
              className="w-full h-[48px] bg-white border border-[#e5e5e5] rounded-[10px] px-[16px] text-[16px] text-[#111] outline-none focus:border-[#cc007e]"
            />
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[393px] px-[24px] pb-[68px] bg-white">
        <button
          onClick={handleContinue}
          disabled={!canContinue}
          className={`w-full h-[56px] rounded-[16px] text-white text-[16px] font-semibold transition-opacity ${
            canContinue ? "bg-[#cc007e]" : "bg-[#cc007e] opacity-40 cursor-not-allowed"
          }`}
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {tc("continue")}
        </button>
      </div>
    </div>
  );
}
