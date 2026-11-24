"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { ScreenHeader } from "@/components/layout/screen-header";
import { ScreenFooter } from "@/components/layout/screen-footer";
import { LocationInput } from "@/components/location-input";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import type { LocationDetails } from "@/types/location";

const RESIDENCE_LOCATION_DETAILS_KEY = "intake_residenceLocationDetails";

function readStoredLocationDetails(): LocationDetails | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(RESIDENCE_LOCATION_DETAILS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocationDetails;
  } catch {
    return null;
  }
}

export default function IntakeResidencePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeResidence");
  const tc = useTranslations("Common");

  useRequireSessionKey("intake_injuries", "/intake/injury");

  const [residence, setResidence] = useState("");
  const [isResidenceValid, setIsResidenceValid] = useState(false);
  const [error, setError] = useState("");

  // Coming back to this screen shows what was entered before rather than an
  // empty field. Read in an effect so the server render matches the first client one.
  useEffect(() => {
    const stored = sessionStorage.getItem("intake_residence") ?? "";
    if (!stored) return;
    setResidence(stored);
    setIsResidenceValid(Boolean(readStoredLocationDetails()));
  }, []);

  const handleContinue = () => {
    if (!residence.trim() || !isResidenceValid) {
      setError(t("required"));
      return;
    }
    sessionStorage.setItem("intake_residence", residence.trim());
    router.push(`/${locale}/intake/treatment-area`);
  };

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      <form
        id="residence-form"
        className="flex-1 overflow-y-auto px-[24px] pt-[32px]"
        onSubmit={(e) => {
          e.preventDefault();
          handleContinue();
        }}
      >
        {/* Headline block — Figma 1949:4322 */}
        <div className="mb-[20px] flex flex-col items-start">
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

        {/* ZIP or City, State — the field never shows a street (Figma 1949:4342) */}
        <LocationInput
          id="residence"
          displayFormat="cityStateZip"
          requirePostalCode
          postalCodeRequiredMessage={t("zipRequired")}
          focusBorderColor="#CC007E"
          focusBorderWidth="1px"
          label={t("label")}
          value={residence}
          onValidityChange={setIsResidenceValid}
          onLocationDetailsChange={(details) => {
            if (!details) {
              sessionStorage.removeItem(RESIDENCE_LOCATION_DETAILS_KEY);
              return;
            }
            sessionStorage.setItem(RESIDENCE_LOCATION_DETAILS_KEY, JSON.stringify(details));
          }}
          onChange={(v) => {
            setResidence(v);
            if (error) setError("");
          }}
          error={error}
          reserveErrorSpace={false}
          useCurrentLocationLabel={t("useCurrentLocation")}
          locationErrorMessage={t("locationError")}
        />
      </form>

      <ScreenFooter
        label={tc("continue")}
        formId="residence-form"
        disabled={!residence.trim() || !isResidenceValid}
      />
    </div>
  );
}
