"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IntakeHeader } from "@/components/intake/intake-header";

const AREAS = [
  "personalInjury",
  "immigration",
  "workersComp",
  "bankruptcyLaw",
  "autoAccidents",
  "duiDwi",
  "criminalDefense",
  "motorcycleAccidents",
] as const;

type Area = (typeof AREAS)[number];

export default function LawyerOnboardingPracticePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("OnboardingLawyerPractice");
  const tc = useTranslations("Common");

  const [selected, setSelected] = useState<Set<Area>>(new Set());

  const toggle = (area: Area) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(area)) {
        next.delete(area);
      } else {
        next.add(area);
      }
      return next;
    });
  };

  const handleContinue = () => {
    if (selected.size === 0) return;
    sessionStorage.setItem("onboarding_practiceAreas", JSON.stringify([...selected]));
    router.push(`/${locale}/onboarding/lawyer/licensed`);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col pb-[100px]">
      <IntakeHeader />

      <div className="flex-1 flex flex-col px-[24px] pt-[32px] gap-[20px]">
        <div className="flex flex-col gap-[4px]">
          <h1
            className="text-[22px] font-bold text-[#111] leading-[1.1] w-full"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("heading")}
          </h1>
          <p className="text-[15px] text-[#6e6e73] font-normal leading-[20px]">{t("subtext")}</p>
        </div>

        <div className="flex flex-wrap gap-[12px]">
          {AREAS.map((area) => {
            const isSelected = selected.has(area);
            return (
              <button
                key={area}
                type="button"
                onClick={() => toggle(area)}
                className={`h-[42px] rounded-[8px] px-[10px] text-[14px] font-medium border transition-colors ${
                  isSelected ? "bg-[#fff1f9] border-[#cc007e] text-[#cc007e]" : "bg-white border-[#e5e5e5] text-[#111]"
                }`}
              >
                {t(area)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[393px] px-[24px] pb-[68px] bg-white">
        <button
          onClick={handleContinue}
          disabled={selected.size === 0}
          className={`w-full h-[56px] rounded-[16px] text-white text-[16px] font-semibold transition-opacity ${
            selected.size > 0 ? "bg-[#cc007e]" : "bg-[#cc007e] opacity-40 cursor-not-allowed"
          }`}
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {tc("continue")}
        </button>
      </div>
    </div>
  );
}
