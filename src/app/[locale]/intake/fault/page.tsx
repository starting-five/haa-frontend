"use client";

import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { usePreloadImages } from "@/hooks/use-preload-images";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type FaultOption = "no" | "yes" | "unknown";

// The date screen that follows opens on the calendar character.
const NEXT_SCREEN_IMAGES = ["/assets/intake/calendar-character.webp"] as const;

export default function IntakeFaultPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeFault");

  useRequireSessionKey("intake_incidentType", "/intake/incident");
  usePreloadImages(NEXT_SCREEN_IMAGES);

  const [selected, setSelected] = useState<FaultOption | null>(null);

  useEffect(() => {
    setSelected((sessionStorage.getItem("intake_fault") as FaultOption | null) ?? null);
  }, []);

  const options: FaultOption[] = ["no", "yes", "unknown"];

  // Answering is the whole interaction on this screen — there is no separate
  // Continue step, so selecting an option persists it and moves the flow on.
  const handleAnswer = (value: FaultOption) => {
    setSelected(value);
    sessionStorage.setItem("intake_fault", value);
    router.push(`/${locale}/intake/date`);
  };

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      <div className="flex-1 overflow-y-auto px-[24px] pt-[12px]">
        <h1
          className="mb-[24px] text-[28px] font-extrabold leading-[1.04] text-[#111]"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>

        {/* Option rows — Figma 3225:5159: 60px, left-aligned label, 10px apart */}
        <div className="flex flex-col gap-[10px]">
          {options.map((value) => {
            const isSelected = value === selected;
            return (
              <button
                key={value}
                type="button"
                onClick={() => handleAnswer(value)}
                className={`flex h-[60px] items-center rounded-[10px] border bg-white py-[16px] pl-[20px] pr-[16px] text-left ${
                  isSelected ? "border-[#cc007e]" : "border-[#d1d1d6]"
                }`}
              >
                <span
                  className="flex-1 text-[16px] font-medium text-[#000]"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  {t(`options.${value}`)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
