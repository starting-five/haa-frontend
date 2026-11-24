"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { Calendar } from "@/components/ui/calendar";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { enUS, es } from "date-fns/locale";
import { useTranslations } from "next-intl";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// react-day-picker classNames slots, restyled to match the Figma "choose a date" card
const CALENDAR_CLASS_NAMES = {
  month: "flex w-full flex-col gap-[20px]",
  // The nav prev/next are absolutely positioned at the calendar edges (justify-between
  // below), so centering the caption keeps the month title genuinely centered between them.
  month_caption: "flex h-[24px] w-full items-center justify-center px-0",
  caption_label: "[font-family:var(--font-nunito-sans)] font-extrabold text-[18px] text-[#212426]",
  nav: "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-[12px]",
  button_previous:
    "flex items-center justify-center size-[32px] rounded-full bg-[#f2f2f7] text-[#212426] shrink-0 hover:bg-[#e5e5ea] aria-disabled:opacity-50",
  button_next:
    "flex items-center justify-center size-[32px] rounded-full bg-[#f2f2f7] text-[#212426] shrink-0 hover:bg-[#e5e5ea] aria-disabled:opacity-50",
  weekdays: "flex w-full justify-between",
  weekday: "[font-family:var(--font-nunito-sans)] font-bold text-[14px] text-[#a0a0a0] w-[36px] text-center",
  week: "flex w-full justify-between mt-[8px]",
  day: "w-[36px] h-[36px] p-0 text-center",
  day_button:
    "flex items-center justify-center size-[36px] rounded-full font-normal text-[15px] [font-family:var(--font-nunito-sans)] text-[#212426] hover:bg-[#f2f2f7] data-[selected-single=true]:bg-[#cc007e] data-[selected-single=true]:font-bold data-[selected-single=true]:text-white",
  outside: "text-[#a0a0a0]",
  disabled: "text-[#a0a0a0] opacity-50",
  today: "",
};

// formats using local date components — avoids toISOString()'s UTC conversion shifting the calendar day
function toISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// parses a "YYYY-MM-DD" string as a local date instead of UTC midnight
function parseISODate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function readStoredDate() {
  if (typeof window === "undefined") return undefined;
  const stored = sessionStorage.getItem("intake_incidentDate");
  return stored ? parseISODate(stored) : undefined;
}

export default function IntakeConfirmDatePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeConfirmDate");
  const calendarLocale = locale === "es" ? es : enUS;

  useRequireSessionKey("intake_incidentDateOption", "/intake/date");

  // "today"/"yesterday" arrive with a date already set; "custom" starts with no selection
  const [date, setDate] = useState<Date | undefined>(readStoredDate);
  const [month, setMonth] = useState<Date>(() => readStoredDate() ?? new Date());

  // the date-selection screen appends a fresh "t" token on every navigation here; Next.js
  // can reuse this page's mounted instance across navigations (search-param changes alone
  // don't remount it), so mount-time state alone can go stale — re-derive it whenever "t" changes
  const cacheBuster = useSearchParams().get("t");
  useEffect(() => {
    const stored = readStoredDate();
    setDate(stored);
    setMonth(stored ?? new Date());
  }, [cacheBuster]);

  const formattedDate = date
    ? new Intl.DateTimeFormat(locale, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(date)
    : null;

  const handleConfirm = () => {
    if (!date) return;
    sessionStorage.setItem("intake_incidentDate", toISODate(date));
    router.push(`/${locale}/intake/location`);
  };

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      <div className="flex-1 overflow-y-auto px-[24px] pt-[32px] flex flex-col gap-[20px]">
        <h1
          className="text-[28px] font-extrabold text-[#111] leading-none"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>

        <div className="flex flex-col gap-[20px] rounded-[16px] bg-white p-[16px]">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            month={month}
            onMonthChange={setMonth}
            locale={calendarLocale}
            disabled={{ after: new Date() }}
            classNames={CALENDAR_CLASS_NAMES}
            className="w-full [--cell-size:36px]"
          />
        </div>

        {formattedDate && (
          <div className="-mt-[36px] flex flex-col gap-[8px] px-[4px]">
            <p
              className="text-[15px] font-semibold leading-normal text-[#000]"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("dateOfIncident")}
            </p>
            <div className="flex items-center rounded-[12px] border border-[#cc007e] px-[16px] py-[12px]">
              <p
                className="flex-1 text-[20px] font-semibold leading-normal text-[#000]"
                style={{ fontFamily: "var(--font-nunito-sans)" }}
              >
                {formattedDate}
              </p>
            </div>
          </div>
        )}
      </div>

      <ScreenFooter
        label={t("confirm")}
        onClick={handleConfirm}
        disabled={!date}
      />
    </div>
  );
}
