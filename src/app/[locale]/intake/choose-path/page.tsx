"use client";

import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { usePreloadImages } from "@/hooks/use-preload-images";
import { STEP_SELECTION_ADVANCE_DELAY_MS, SUPPORT_PHONE_TEL } from "@/lib/constants";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

// The story screen that follows opens on the microphone render.
const NEXT_SCREEN_IMAGES = ["/assets/intake/mic-hero.webp"] as const;

export default function IntakeChoosePathPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeChoosePath");
  const [selected, setSelected] = useState<"guideMe" | null>(null);

  usePreloadImages(NEXT_SCREEN_IMAGES);

  const handleSelect = () => {
    setSelected("guideMe");
    sessionStorage.setItem("intake_choosePath", "guideMe");
    // brief delay so the selected state is visible before navigating away
    setTimeout(() => router.push(`/${locale}/intake/tell`), STEP_SELECTION_ADVANCE_DELAY_MS);
  };

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      <div className="flex-1 overflow-y-auto px-[24px] pt-[32px] flex flex-col gap-[20px]">
        {/* Title block */}
        <div className="flex flex-col gap-[8px]">
          <p
            className="text-[28px] font-extrabold text-[#212426] leading-none w-full"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("heading")}
          </p>
          <p
            className="text-[16px] text-[#5c5c5c] font-normal w-full"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {t("subtext")}
          </p>
        </div>

        {/* Options */}
        <div className="flex flex-col gap-[20px]">
          {/* I'll do it from your phone */}
          <button
            type="button"
            onClick={handleSelect}
            className={`bg-white flex items-center justify-between p-[20px] rounded-[16px] border w-full text-left ${
              selected === "guideMe" ? "border-[#cc007e]" : "border-[#dedede]"
            }`}
          >
            <div className="flex flex-col gap-[4px] flex-1 min-w-0">
              <p
                className="text-[16px] font-medium text-[#000] leading-normal"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {t("guideMe")}
              </p>
              <p
                className="text-[14px] text-[#a0a0a0] font-normal leading-normal whitespace-nowrap"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {t("guideMeSub")}
              </p>
            </div>
          </button>

          {/* Talk to someone now */}
          <button
            type="button"
            onClick={() => {
              window.location.href = SUPPORT_PHONE_TEL;
            }}
            className="bg-white flex items-center justify-between p-[20px] rounded-[16px] border border-[#dedede] w-full text-left"
          >
            <div className="flex flex-col gap-[4px] flex-1 min-w-0">
              <p
                className="text-[16px] font-medium text-[#000] leading-normal"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {t("talkToSomeone")}
              </p>
              <p
                className="text-[14px] text-[#a0a0a0] font-normal leading-normal whitespace-nowrap"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {t("talkToSomeoneSub")}
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
