"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IntakeHeader } from "@/components/intake/intake-header";

const ROLES = ["attorney", "paralegal", "legalAssistant", "adminStaff"] as const;
type Role = (typeof ROLES)[number];

function RadioSelected() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className="shrink-0"
    >
      <rect
        fill="white"
        height="18.8"
        rx="9.4"
        width="18.8"
        x="0.6"
        y="0.6"
      />
      <rect
        height="18.8"
        rx="9.4"
        stroke="url(#radio-sel-border)"
        strokeWidth="1.2"
        width="18.8"
        x="0.6"
        y="0.6"
      />
      <circle
        cx="10"
        cy="10"
        fill="url(#radio-sel-fill)"
        r="5"
      />
      <defs>
        <linearGradient
          id="radio-sel-border"
          x1="19.24"
          x2="0.153"
          y1="18.368"
          y2="18.035"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#CC017E" />
          <stop
            offset="1"
            stopColor="#FF4EBB"
          />
        </linearGradient>
        <linearGradient
          id="radio-sel-fill"
          x1="14.62"
          x2="5.077"
          y1="14.184"
          y2="14.017"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#CC017E" />
          <stop
            offset="1"
            stopColor="#FF4EBB"
          />
        </linearGradient>
      </defs>
    </svg>
  );
}

function RadioEmpty() {
  return <div className="shrink-0 size-[20px] bg-white rounded-full border-[1.2px] border-[#dedede]" />;
}

export default function LawyerOnboardingRolePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("OnboardingLawyerRole");
  const tc = useTranslations("Common");

  const [selected, setSelected] = useState<Role>("attorney");

  const handleContinue = () => {
    sessionStorage.setItem("onboarding_role", selected);
    router.push(`/${locale}/onboarding/lawyer/practice`);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col pb-[100px]">
      <IntakeHeader />

      <div className="flex-1 flex flex-col px-[24px] pt-[32px] gap-[32px]">
        <h1
          className="text-[22px] font-bold text-[#111] leading-[32px]"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>

        <div className="flex flex-col gap-[24px] w-full">
          {ROLES.map((role) => {
            const isSelected = selected === role;
            return (
              <button
                key={role}
                type="button"
                onClick={() => setSelected(role)}
                className={`w-full h-[52px] bg-white rounded-[10px] flex items-center justify-between px-[16px] border-[1.2px] ${
                  isSelected ? "border-[#cc017e]" : "border-[#e5e5e5]"
                }`}
              >
                <span className="text-[16px] text-[#111] font-normal">{t(role)}</span>
                {isSelected ? <RadioSelected /> : <RadioEmpty />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[393px] px-[24px] pb-[68px] bg-white">
        <button
          onClick={handleContinue}
          className="w-full h-[56px] bg-[#cc007e] rounded-[16px] text-white text-[16px] font-semibold"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {tc("continue")}
        </button>
      </div>
    </div>
  );
}
