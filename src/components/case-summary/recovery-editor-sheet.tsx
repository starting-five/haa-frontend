"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LocationInput } from "@/components/location-input";
import type { LocationDetails } from "@/types/location";

interface RecoveryEditorSheetProps {
  initialTreatmentArea: string;
  initialDetails: LocationDetails | null;
  onSave: (treatmentArea: string, details: LocationDetails | null) => void;
  onCancel: () => void;
}

export function RecoveryEditorSheet({
  initialTreatmentArea,
  initialDetails,
  onSave,
  onCancel,
}: RecoveryEditorSheetProps) {
  const t = useTranslations("IntakeReview");
  const tLocation = useTranslations("IntakeLocation");
  const [treatmentAreaDraft, setTreatmentAreaDraft] = useState(initialTreatmentArea.trim());
  const [treatmentAreaDetailsDraft, setTreatmentAreaDetailsDraft] = useState<LocationDetails | null>(initialDetails);
  const [isTreatmentAreaValid, setIsTreatmentAreaValid] = useState(Boolean(initialTreatmentArea.trim()));
  const [showRecoveryError, setShowRecoveryError] = useState(false);

  const handleSaveRecovery = () => {
    const value = treatmentAreaDraft.trim();
    if (!value || !isTreatmentAreaValid) {
      setShowRecoveryError(true);
      return;
    }

    onSave(value, treatmentAreaDetailsDraft);
  };

  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/35">
      <div className="w-full rounded-t-[20px] bg-white px-[20px] pb-[24px] pt-[12px]">
        <div className="mx-auto mb-[12px] h-[4px] w-[44px] rounded-full bg-[#d1d1d6]" />
        <h2
          className="mb-[16px] text-center text-[20px] font-extrabold text-black"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("editRecoveryTitle")}
        </h2>

        <LocationInput
          id="review-treatment-area"
          label={t("locationLabel")}
          value={treatmentAreaDraft}
          onValidityChange={setIsTreatmentAreaValid}
          onLocationDetailsChange={setTreatmentAreaDetailsDraft}
          onChange={(next) => {
            setTreatmentAreaDraft(next);
            if (showRecoveryError) setShowRecoveryError(false);
          }}
          reserveErrorSpace={false}
          useCurrentLocationLabel={tLocation("useCurrentLocation")}
          locationErrorMessage={tLocation("locationError")}
          displayFormat="cityStateZip"
        />

        {showRecoveryError && (
          <p
            className="mt-[10px] text-[12px] text-[#cc007e]"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {t("treatmentAreaRequired")}
          </p>
        )}

        <div className="mt-[16px] flex flex-col gap-[8px]">
          <button
            type="button"
            onClick={handleSaveRecovery}
            disabled={!treatmentAreaDraft.trim() || !isTreatmentAreaValid}
            className={`h-[56px] w-full rounded-[16px] text-[16px] font-semibold ${
              !treatmentAreaDraft.trim() || !isTreatmentAreaValid
                ? "bg-[#e5e5e5] text-[#8c8c8c] cursor-not-allowed"
                : "bg-brand text-white"
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
