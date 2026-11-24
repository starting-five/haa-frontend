"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { LocationInput } from "@/components/location-input";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function AmbassadorOnboardingLocationPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("OnboardingAmbassadorCity");
  const tc = useTranslations("Common");

  useRequireSessionKey("onboarding_ambassador_preferredName", "/ambassadors/onboarding/name");

  const [city, setCity] = useState(
    typeof window !== "undefined" ? (sessionStorage.getItem("onboarding_ambassador_city") ?? "") : ""
  );
  const [isValidLocation, setIsValidLocation] = useState(Boolean(city.trim()));

  const handleContinue = () => {
    if (!isValidLocation) return;

    const nextCity = city.trim();
    if (!nextCity) return;

    sessionStorage.setItem("onboarding_ambassador_city", nextCity);
    sessionStorage.setItem("onboarding_ambassador_locale", locale);
    router.push(`/${locale}/ambassadors/onboarding/username`);
  };

  const handleDoLater = () => {
    router.push(`/${locale}/ambassadors/onboarding/username`);
  };

  return (
    <div className="h-dvh flex flex-col max-w-[393px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showCallButton={false} />

      <main className="flex-1 overflow-y-auto px-[24px] pt-[32px]">
        <h1
          className="text-[28px] font-extrabold leading-[1.04] text-black"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>

        <p
          className="mt-[8px] text-[16px] font-normal leading-[1.2] text-[#5c5c5c]"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          {t("subtext")}
        </p>

        <div className="mt-[24px]">
          <LocationInput
            id="ambassadorLocation"
            label={t("label")}
            value={city}
            onChange={setCity}
            onValidityChange={setIsValidLocation}
            useCurrentLocationLabel={t("useCurrentLocation")}
            showUseCurrentLocation
            focusBorderColor="#CC007E"
            focusBorderWidth="1px"
            displayFormat="cityStateZip"
            reserveErrorSpace={false}
          />
        </div>
      </main>

      <ScreenFooter
        label={tc("continue")}
        onClick={handleContinue}
        disabled={!isValidLocation}
        secondaryLabel={t("doThisLater")}
        onSecondaryClick={handleDoLater}
      />
    </div>
  );
}
