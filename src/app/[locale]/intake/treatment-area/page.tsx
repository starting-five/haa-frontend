"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { LocationInput } from "@/components/location-input";
import { usePreloadImages } from "@/hooks/use-preload-images";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import type { LocationDetails } from "@/types/location";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// The role grid that follows shows all four renders at once.
const NEXT_SCREEN_IMAGES = ["driver", "passanger", "pedestrian", "bicyclist"].map(
  (name) => `/assets/role/${name}.webp`
);

const TREATMENT_AREA_LOCATION_DETAILS_KEY = "intake_treatmentAreaLocationDetails";
const RESIDENCE_LOCATION_DETAILS_KEY = "intake_residenceLocationDetails";

function readStoredLocationDetails(key: string): LocationDetails | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocationDetails;
  } catch {
    return null;
  }
}

export default function IntakeTreatmentAreaPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeTreatmentArea");
  const tc = useTranslations("Common");

  useRequireSessionKey("intake_residence", "/intake/residence");
  usePreloadImages(NEXT_SCREEN_IMAGES);

  const [location, setLocation] = useState("");
  const [isLocationValid, setIsLocationValid] = useState(false);
  const [sameAsHome, setSameAsHome] = useState(false);
  // What the patient had typed before ticking "same as home", so unticking
  // gives it back instead of wiping the field.
  const typedBeforeSameAsHome = useRef("");
  const typedBeforeSameAsHomeValid = useRef(false);
  const typedBeforeSameAsHomeDetails = useRef<LocationDetails | null>(null);

  // Coming back to this screen shows what was entered before rather than an
  // empty field. Read in an effect so the server render matches the first client one.
  useEffect(() => {
    const stored = sessionStorage.getItem("intake_treatmentArea") ?? "";
    const storedDetails = readStoredLocationDetails(TREATMENT_AREA_LOCATION_DETAILS_KEY);
    if (!stored) return;
    setLocation(stored);
    setIsLocationValid(Boolean(storedDetails));
    setSameAsHome(stored === (sessionStorage.getItem("intake_residence") ?? ""));
  }, []);

  const toggleSameAsHome = () => {
    if (sameAsHome) {
      setSameAsHome(false);
      setLocation(typedBeforeSameAsHome.current);
      setIsLocationValid(typedBeforeSameAsHomeValid.current);
      if (typedBeforeSameAsHomeDetails.current) {
        sessionStorage.setItem(
          TREATMENT_AREA_LOCATION_DETAILS_KEY,
          JSON.stringify(typedBeforeSameAsHomeDetails.current)
        );
      } else {
        sessionStorage.removeItem(TREATMENT_AREA_LOCATION_DETAILS_KEY);
      }
      return;
    }
    typedBeforeSameAsHome.current = location;
    typedBeforeSameAsHomeValid.current = isLocationValid;
    typedBeforeSameAsHomeDetails.current = readStoredLocationDetails(TREATMENT_AREA_LOCATION_DETAILS_KEY);
    setSameAsHome(true);
    const residence = sessionStorage.getItem("intake_residence") ?? "";
    const residenceDetails = readStoredLocationDetails(RESIDENCE_LOCATION_DETAILS_KEY);
    setLocation(residence);
    setIsLocationValid(Boolean(residence.trim() && residenceDetails));
    if (residenceDetails) {
      sessionStorage.setItem(TREATMENT_AREA_LOCATION_DETAILS_KEY, JSON.stringify(residenceDetails));
    } else {
      sessionStorage.removeItem(TREATMENT_AREA_LOCATION_DETAILS_KEY);
    }
  };

  const handleContinue = () => {
    if (!location.trim() || !isLocationValid) return;

    sessionStorage.setItem("intake_treatmentArea", location.trim());
    router.push(`/${locale}/intake/role`);
  };

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      <form
        id="treatment-area-form"
        className="flex-1 overflow-y-auto px-[24px] pt-[32px]"
        onSubmit={(e) => {
          e.preventDefault();
          handleContinue();
        }}
      >
        <h1
          className="text-[28px] font-extrabold text-[#111] leading-none mb-[24px]"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>

        {/* ZIP or City, State — the field never shows a street (Figma 1949:4417) */}
        <LocationInput
          id="treatmentArea"
          displayFormat="cityStateZip"
          focusBorderColor="#CC007E"
          focusBorderWidth="1px"
          label={t("label")}
          value={location}
          onValidityChange={setIsLocationValid}
          onLocationDetailsChange={(details) => {
            if (!details) {
              sessionStorage.removeItem(TREATMENT_AREA_LOCATION_DETAILS_KEY);
              return;
            }
            sessionStorage.setItem(TREATMENT_AREA_LOCATION_DETAILS_KEY, JSON.stringify(details));
          }}
          onChange={(v) => {
            setLocation(v);
            setSameAsHome(false);
          }}
          useCurrentLocationLabel={t("useCurrentLocation")}
          locationErrorMessage={t("locationError")}
          reserveErrorSpace={false}
        />

        {/* Same as home checkbox — Figma 1949:4412, the 26px box and its tick drawn from that node */}
        <button
          type="button"
          role="checkbox"
          aria-checked={sameAsHome}
          onClick={toggleSameAsHome}
          className="mt-[18px] flex h-[26px] items-center gap-[10px]"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 26 26"
            fill="none"
            aria-hidden="true"
            className="shrink-0"
          >
            <rect
              x="0.5"
              y="0.5"
              width="25"
              height="25"
              rx="3.5"
              fill="white"
              stroke="#E5E5EA"
            />
            {sameAsHome && (
              <path
                d="M5 13.5L10 18.5L21 7.5"
                stroke="black"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
          <span
            className="text-left text-[14px] font-normal leading-[90%] text-black"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {t("sameAsHome")}
          </span>
        </button>
      </form>

      <ScreenFooter
        label={tc("continue")}
        formId="treatment-area-form"
        disabled={!location.trim() || !isLocationValid}
      />
    </div>
  );
}
