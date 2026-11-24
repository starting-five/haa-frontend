"use client";

import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { STEP_SELECTION_ADVANCE_DELAY_MS } from "@/lib/constants";
import { ROLE_VALUES } from "@/types/intake";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function IntakeRolePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeRole");

  useRequireSessionKey("intake_treatmentArea", "/intake/treatment-area");

  const [selected, setSelected] = useState<string>("");

  const handleSelect = (roleValue: string) => {
    setSelected(roleValue);
    sessionStorage.setItem("intake_role", roleValue);
    // brief delay so the selected state is visible before navigating away
    setTimeout(() => router.push(`/${locale}/intake/who-was-with-you`), STEP_SELECTION_ADVANCE_DELAY_MS);
  };

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      {/* Figma 1949:3653 — logo, Call and language only; no back chevron on this frame */}
      <ScreenHeader showLanguageSelector={false} />

      <div className="flex-1 overflow-y-auto px-[24px] pt-[32px]">
        <h1
          className="text-[28px] font-extrabold leading-[104%] text-black mb-[32px]"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>

        {/* Role grid — Figma 1949:3664: 169px square cards, 6px between columns and 5px between rows */}
        <div className="grid grid-cols-2 gap-x-[6px] gap-y-[5px]">
          {ROLE_VALUES.map((role) => {
            const isSelected = selected === role.value;
            return (
              <button
                key={role.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => handleSelect(role.value)}
                className={`relative flex h-[169px] w-full flex-col items-center overflow-hidden rounded-[12px] border bg-white ${
                  isSelected ? "border-[#cc007e]" : "border-[#dedede]"
                }`}
              >
                {/* Figure — the design places a 127px-tall render along the top of the card */}
                <span className="flex h-[127px] w-full items-center justify-center">
                  <Image
                    src={role.image}
                    alt=""
                    width={role.width}
                    height={role.height}
                    loading="eager"
                    unoptimized
                    decoding="sync"
                    className="h-[127px] w-auto object-contain"
                  />
                </span>
                <span
                  className="absolute bottom-[9px] left-0 right-0 text-center text-[14px] font-normal leading-[17px] text-[#010101]"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  {t(role.value)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
