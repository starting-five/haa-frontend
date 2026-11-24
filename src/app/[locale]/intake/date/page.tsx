"use client";

import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { usePreloadImages } from "@/hooks/use-preload-images";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { STEP_SELECTION_ADVANCE_DELAY_MS } from "@/lib/constants";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type DateOption = "today" | "yesterday" | "custom";

// formats using local date components — avoids toISOString()'s UTC conversion shifting the calendar day
const toISODate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Both routes out of here end on the location screen and its pin.
const NEXT_SCREEN_IMAGES = ["/assets/intake/location-pin.webp"] as const;

export default function IntakeDatePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeDate");

  useRequireSessionKey("intake_incidentType", "/intake/incident");
  useRequireSessionKey("intake_fault", "/intake/fault");
  usePreloadImages(NEXT_SCREEN_IMAGES);

  // restores the highlighted option when the user navigates back to this screen; starts
  // null (matching SSR) and synced from sessionStorage after mount to avoid a hydration mismatch
  const [selected, setSelected] = useState<DateOption | null>(null);
  useEffect(() => {
    setSelected((sessionStorage.getItem("intake_incidentDateOption") as DateOption | null) ?? null);
  }, []);

  // "today"/"yesterday" resolve to a concrete date immediately; "custom" leaves the
  // date unset so confirm-date's calendar starts empty and its Confirm button stays disabled
  const commit = (option: DateOption, date: Date | null) => {
    setSelected(option);
    sessionStorage.setItem("intake_incidentDateOption", option);
    if (date) sessionStorage.setItem("intake_incidentDate", toISODate(date));
    else sessionStorage.removeItem("intake_incidentDate");
    // a unique query string keeps the client router cache from ever reusing a
    // previously rendered confirm-date instance (with stale sessionStorage-derived state)
    // brief delay so the selected state is visible before navigating away
    setTimeout(() => router.push(`/${locale}/intake/confirm-date?t=${Date.now()}`), STEP_SELECTION_ADVANCE_DELAY_MS);
  };

  const options: { key: DateOption; label: string }[] = [
    { key: "today", label: t("today") },
    { key: "yesterday", label: t("yesterday") },
    { key: "custom", label: t("chooseDate") },
  ];

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      {/* Figma 1933:2595 — the headline sits 32px below the header and the
          content block another 32px below it, with the render and the options
          20px apart and the rows 10px apart. */}
      <div className="flex-1 overflow-y-auto">
        <h1
          className="px-[24px] pt-[32px] text-[28px] font-extrabold text-[#111] leading-none"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>

        <div className="flex flex-col items-center gap-[20px] px-[24px] pt-[32px]">
          <Image
            src="/assets/intake/calendar-character.webp"
            alt=""
            width={360}
            height={270}
            priority
            unoptimized
            decoding="sync"
            className="h-[135px] w-[180px] shrink-0 object-contain"
          />

          <div className="flex w-full flex-col gap-[10px]">
            {options.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (key === "today") commit("today", new Date());
                  else if (key === "yesterday") commit("yesterday", new Date(Date.now() - 86400000));
                  else commit("custom", null);
                }}
                className={`flex h-[60px] items-center rounded-[10px] border bg-white py-[16px] pl-[20px] pr-[16px] text-left ${
                  selected === key ? "border-[#cc007e]" : "border-[#d1d1d6]"
                }`}
              >
                <span
                  className="flex-1 text-[16px] font-medium text-[#000]"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
