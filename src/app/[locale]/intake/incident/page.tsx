"use client";

import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { STEP_SELECTION_ADVANCE_DELAY_MS } from "@/lib/constants";
import { INCIDENT_TYPE_VALUES } from "@/types/intake";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";

// The design's rendered icons, exported at their source size. Each is shown
// 54px tall, so the width follows the render's own proportions.
// The design's renders (Figma 2761:7584), stored at twice their 54px display
// height so they are served as-is with nothing to resize on the way.
const INCIDENT_ICONS: Record<(typeof INCIDENT_TYPE_VALUES)[number], { src: string; width: number; height: number }> = {
  car: { src: "/assets/intake/incident/car.webp", width: 216, height: 108 },
  motorcycle: { src: "/assets/intake/incident/motorcycle.webp", width: 189, height: 108 },
  truck: { src: "/assets/intake/incident/truck.webp", width: 170, height: 108 },
  rideshare: { src: "/assets/intake/incident/rideshare.webp", width: 178, height: 108 },
  "slip-and-fall": { src: "/assets/intake/incident/slip-fall.webp", width: 196, height: 108 },
  pedestrian: { src: "/assets/intake/incident/pedestrian.webp", width: 151, height: 108 },
  bicycle: { src: "/assets/intake/incident/bicycle.webp", width: 220, height: 108 },
  other: { src: "/assets/intake/incident/other.webp", width: 202, height: 108 },
};

export default function IntakeIncidentPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeIncident");

  useRequireSessionKey("intake_submissionId", "/intake/phone");

  // restores the highlighted option when the user navigates back to this screen
  const [selected, setSelected] = useState<(typeof INCIDENT_TYPE_VALUES)[number] | null>(() =>
    typeof window === "undefined"
      ? null
      : ((sessionStorage.getItem("intake_incidentType") as (typeof INCIDENT_TYPE_VALUES)[number] | null) ?? null)
  );

  const handleSelect = (option: (typeof INCIDENT_TYPE_VALUES)[number]) => {
    setSelected(option);
    sessionStorage.setItem("intake_incidentType", option);
    // brief delay so the selected state is visible before navigating away
    setTimeout(() => router.push(`/${locale}/intake/fault`), STEP_SELECTION_ADVANCE_DELAY_MS);
  };

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      <div className="flex-1 overflow-y-auto px-[24px] pt-[32px]">
        <h1
          className="text-[28px] font-extrabold text-[#111] leading-none mb-[24px]"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>

        <div className="grid grid-cols-2 gap-[12px] pb-[24px]">
          {INCIDENT_TYPE_VALUES.map((option) => {
            const icon = INCIDENT_ICONS[option];
            const isSelected = selected === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => handleSelect(option)}
                className={`flex h-[104px] flex-col items-center gap-[8px] rounded-[12px] border bg-white px-[12px] pt-[15px] text-center ${
                  isSelected ? "border-[#cc007e]" : "border-[#e5e7eb]"
                }`}
              >
                <span className="flex h-[54px] items-center justify-center">
                  <Image
                    src={icon.src}
                    alt=""
                    width={icon.width}
                    height={icon.height}
                    loading="eager"
                    unoptimized
                    decoding="sync"
                    className="h-[54px] w-auto object-contain"
                  />
                </span>
                <span className="text-[12px] font-semibold leading-[16px] text-[#1e2939]">
                  {t(`options.${option}`)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
