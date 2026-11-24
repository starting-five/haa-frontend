"use client";

import { LOCALES } from "@/i18n/locales";

type PreferredLanguageCardsProps = {
  selectedLocale: string;
  onSelectLocale: (locale: string) => void;
};

export function PreferredLanguageCards({ selectedLocale, onSelectLocale }: PreferredLanguageCardsProps) {
  const createSelectHandler = (localeCode: string) => () => {
    onSelectLocale(localeCode);
  };

  return (
    <div className="flex w-full gap-[16px]">
      {LOCALES.map((locale) => {
        const isSelected = selectedLocale === locale.code;
        const handleSelect = createSelectHandler(locale.code);
        return (
          <button
            type="button"
            key={locale.code}
            onClick={(event) => {
              event.preventDefault();
              handleSelect();
            }}
            className={`flex h-[167px] flex-1 select-none touch-manipulation flex-col items-center justify-center gap-[16px] rounded-[12px] py-[32px] transition-colors ${
              isSelected
                ? "border border-[#cc007e] bg-white"
                : "border border-[rgba(33,36,38,0.08)] bg-white"
            }`}
          >
            <span
              className="text-[64px] font-extrabold leading-none text-[#111]"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {locale.code.toUpperCase()}
            </span>
            <span className={`text-[18px] font-medium ${isSelected ? "text-[#111]" : "text-[#6e6e73]"}`}>
              {locale.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
