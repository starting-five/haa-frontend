"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IntakeHeader } from "@/components/intake/intake-header";

export default function LawyerOnboardingNamePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("OnboardingLawyerName");
  const tc = useTranslations("Common");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const canContinue = firstName.trim().length > 0 && lastName.trim().length > 0;

  const handleContinue = () => {
    if (!canContinue) return;
    sessionStorage.setItem("onboarding_firstName", firstName.trim());
    sessionStorage.setItem("onboarding_lastName", lastName.trim());
    router.push(`/${locale}/onboarding/lawyer/firm`);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col pb-[100px]">
      <IntakeHeader />

      <div className="flex-1 flex flex-col gap-[32px] px-[24px] pt-[32px]">
        <h1
          className="text-[22px] font-bold text-[#111] leading-normal w-full"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>

        <div className="flex flex-col gap-[24px] w-full">
          {/* First Name */}
          <div className="flex flex-col gap-[8px] w-full">
            <label className="text-[14px] text-[#6e6e73] font-normal">{t("firstName")}</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full h-[52px] bg-white border border-[#e5e5ea] rounded-[12px] px-[16px] text-[16px] text-[#111] outline-none focus:border-[#cc007e]"
            />
          </div>

          {/* Last Name */}
          <div className="flex flex-col gap-[8px] w-full">
            <label className="text-[14px] text-[#6e6e73] font-normal">{t("lastName")}</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full h-[52px] bg-white border border-[#e5e5ea] rounded-[12px] px-[16px] text-[16px] text-[#111] outline-none focus:border-[#cc007e]"
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
