"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { INJURY_TYPE_OPTIONS, type InjuryTypeOptionKey } from "@/lib/constants";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function IntakeInjuryTypePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeInjuryType");
  const tc = useTranslations("Common");

  useRequireSessionKey("intake_injuries", "/intake/injury");

  const [selected, setSelected] = useState<InjuryTypeOptionKey[]>([]);

  useEffect(() => {
    const raw = sessionStorage.getItem("intake_injury_types");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as { selected?: string[] };
      const selectedValues = (parsed.selected ?? []).filter((value): value is InjuryTypeOptionKey =>
        INJURY_TYPE_OPTIONS.includes(value as InjuryTypeOptionKey)
      );
      setSelected(selectedValues);
    } catch {
      // Ignore malformed session data and let the user re-enter selections.
    }
  }, []);

  const toggleSelection = (option: InjuryTypeOptionKey) => {
    setSelected((current) =>
      current.includes(option) ? current.filter((value) => value !== option) : [...current, option]
    );
  };

  const handleContinue = () => {
    if (!selected.length) return;

    sessionStorage.setItem(
      "intake_injury_types",
      JSON.stringify({
        selected,
      })
    );

    router.push(`/${locale}/intake/treatment-area`);
  };

  return (
    <div className="h-dvh flex flex-col max-w-[393px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      <div className="flex-1 overflow-y-auto px-[24px] pt-[32px]">
        <div className="flex flex-col gap-[6px]">
          <h1
            className="text-[28px] font-extrabold leading-[1.04] text-[#1c1c1e]"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("heading")}
          </h1>
          <p
            className="text-[16px] text-[#a0a0a0]"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {t("subtext")}
          </p>
        </div>

        <div className="mt-[24px] grid grid-cols-2 gap-[12px]">
          {INJURY_TYPE_OPTIONS.map((option) => {
            const isSelected = selected.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => toggleSelection(option)}
                className={`h-[52px] rounded-[12px] border-[1.5px] px-[16px] text-[15px] text-center text-[#1c1c1e] transition-colors ${
                  isSelected ? "border-[#cc007e] bg-white" : "border-[#e5e5e5] bg-white"
                }`}
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {t(option)}
              </button>
            );
          })}
        </div>
      </div>

      <ScreenFooter
        label={tc("continue")}
        onClick={handleContinue}
        disabled={selected.length === 0}
      />
    </div>
  );
}
