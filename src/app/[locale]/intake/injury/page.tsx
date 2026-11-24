"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { INJURY_OPTIONS, type InjuryOptionKey } from "@/lib/constants";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function IntakeInjuryPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeInjury");
  const tc = useTranslations("Common");

  useRequireSessionKey("intake_description", "/intake/tell");

  const [selected, setSelected] = useState<InjuryOptionKey[]>([]);
  const [somewhereElseText, setSomewhereElseText] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem("intake_injuries");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as { selected?: string[]; somewhereElseText?: string };
      const selectedValues = (parsed.selected ?? []).filter((value): value is InjuryOptionKey =>
        INJURY_OPTIONS.includes(value as InjuryOptionKey)
      );
      setSelected(selectedValues);
      setSomewhereElseText(parsed.somewhereElseText ?? "");
    } catch {
      // Ignore malformed session data and let the user re-enter selections.
    }
  }, []);

  const canContinue = useMemo(() => {
    if (selected.length === 0) return false;
    // "Somewhere else" is a real selection: it needs the free-text detail.
    if (selected.includes("somewhereElse") && somewhereElseText.trim().length === 0) return false;
    return true;
  }, [selected, somewhereElseText]);

  const toggleSelection = (option: InjuryOptionKey) => {
    setSelected((current) =>
      current.includes(option) ? current.filter((value) => value !== option) : [...current, option]
    );
  };

  const handleContinue = () => {
    if (!canContinue) return;

    sessionStorage.setItem(
      "intake_injuries",
      JSON.stringify({
        selected,
        somewhereElseText: selected.includes("somewhereElse") ? somewhereElseText.trim() : "",
      })
    );

    router.push(`/${locale}/intake/residence`);
  };

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      <div className="flex-1 overflow-y-auto px-[24px] pt-[32px]">
        {/* Headline block — Figma 3225:5608 */}
        <div className="flex flex-col items-start">
          <h1
            className="text-[28px] font-extrabold leading-[104%] text-[#101828]"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("heading")}
          </h1>
          <p
            className="pt-[8px] text-[16px] leading-[22.75px] text-[#5c5c5c]"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {t("subtext")}
          </p>
        </div>

        {/* Check cards — Figma 3225:5676; the checked card carries the brand border, the box itself never changes colour */}
        <div className="flex flex-col gap-[12px] pb-[32px] pt-[16px]">
          {INJURY_OPTIONS.map((option) => {
            const isSelected = selected.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => toggleSelection(option)}
                aria-pressed={isSelected}
                className={`flex h-[60px] w-full cursor-pointer items-center rounded-[10px] border bg-white px-[20px] py-[16px] text-left ${
                  isSelected ? "border-[#cc007e]" : "border-[#e5e7eb]"
                }`}
              >
                <span
                  className="text-[14px] font-semibold leading-[20px] text-[#101828]"
                  style={{ fontFamily: "var(--font-nunito-sans)" }}
                >
                  {t(option)}
                </span>
              </button>
            );
          })}

          {/* "Somewhere else" reveals a free-text field for the detail — Figma 2723-5338 */}
          {selected.includes("somewhereElse") && (
            <input
              type="text"
              value={somewhereElseText}
              onChange={(event) => setSomewhereElseText(event.target.value)}
              placeholder={t("somewhereElsePlaceholder")}
              aria-label={t("somewhereElsePlaceholder")}
              className="h-[52px] w-full rounded-[10px] border border-[#e5e7eb] bg-white px-[16px] text-[14px] text-[#101828] outline-none placeholder:text-[#8d8d8d] focus:border-[#cc007e]"
              style={{ fontFamily: "var(--font-inter)" }}
            />
          )}
        </div>
      </div>

      <ScreenFooter
        label={tc("continue")}
        onClick={handleContinue}
        disabled={!canContinue}
      />
    </div>
  );
}
