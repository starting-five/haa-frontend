"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { INJURY_OPTIONS, type InjuryOptionKey } from "@/lib/constants";

interface InjuriesEditorSheetProps {
  initialSelected: InjuryOptionKey[];
  onSave: (selected: InjuryOptionKey[]) => void;
  onCancel: () => void;
}

export function InjuriesEditorSheet({ initialSelected, onSave, onCancel }: InjuriesEditorSheetProps) {
  const t = useTranslations("IntakeReview");
  const tInjury = useTranslations("IntakeInjury");
  const [injuriesDraft, setInjuriesDraft] = useState<InjuryOptionKey[]>(initialSelected);
  const [showInjuriesErrors, setShowInjuriesErrors] = useState(false);

  const toggleInjuryDraft = (option: InjuryOptionKey) => {
    setInjuriesDraft((current) =>
      current.includes(option) ? current.filter((value) => value !== option) : [...current, option]
    );
    if (showInjuriesErrors) setShowInjuriesErrors(false);
  };

  const handleSaveInjuries = () => {
    if (!injuriesDraft.length) {
      setShowInjuriesErrors(true);
      return;
    }

    onSave(injuriesDraft);
  };

  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/35">
      <div className="max-h-[85dvh] w-full overflow-y-auto rounded-t-[20px] bg-white px-[20px] pb-[24px] pt-[12px]">
        <div className="mx-auto mb-[12px] h-[4px] w-[44px] rounded-full bg-[#d1d1d6]" />
        <h2
          className="mb-[16px] text-center text-[20px] font-extrabold text-black"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("editInjuriesTitle")}
        </h2>

        <div className="flex flex-col gap-[16px]">
          <div>
            <p
              className="mb-[8px] text-[14px] font-semibold text-[#111]"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {tInjury("heading")}
            </p>
            <div className="grid grid-cols-2 gap-[10px]">
              {INJURY_OPTIONS.map((option) => {
                const isSelected = injuriesDraft.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleInjuryDraft(option)}
                    className={`h-[48px] rounded-[12px] border-[1.5px] px-[12px] text-[14px] text-center ${
                      isSelected
                        ? "border-[#cc007e] bg-white text-[#1c1c1e]"
                        : "border-[#e5e5e5] bg-white text-[#1c1c1e]"
                    }`}
                    style={{ fontFamily: "var(--font-inter)" }}
                  >
                    {tInjury(option)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {showInjuriesErrors && (
          <p
            className="mt-[10px] text-[12px] text-[#cc007e]"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {t("injuriesRequired")}
          </p>
        )}

        <div className="mt-[16px] flex flex-col gap-[8px]">
          <button
            type="button"
            onClick={handleSaveInjuries}
            disabled={!injuriesDraft.length}
            className={`h-[56px] w-full rounded-[16px] text-[16px] font-semibold ${
              !injuriesDraft.length ? "bg-[#e5e5e5] text-[#8c8c8c] cursor-not-allowed" : "bg-brand text-white"
            }`}
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("saveChanges")}
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="h-[24px] text-center text-[14px] font-semibold text-[#6E6E73] underline"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
