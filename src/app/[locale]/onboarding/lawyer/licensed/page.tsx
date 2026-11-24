"use client";

import { useState, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IntakeHeader } from "@/components/intake/intake-header";

const US_STATES = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
];

export default function LawyerOnboardingLicensedPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("OnboardingLawyerLicensed");
  const tc = useTranslations("Common");

  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addState = (state: string) => {
    if (!selected.includes(state)) setSelected((prev) => [...prev, state]);
    setOpen(false);
  };

  const removeState = (state: string) => {
    setSelected((prev) => prev.filter((s) => s !== state));
  };

  const handleContinue = () => {
    if (selected.length === 0) return;
    sessionStorage.setItem("onboarding_licensedStates", JSON.stringify(selected));
    router.push(`/${locale}/onboarding/lawyer/phone`);
  };

  const available = US_STATES.filter((s) => !selected.includes(s));

  return (
    <div className="min-h-screen bg-white flex flex-col pb-[100px]">
      <IntakeHeader />

      <div className="flex-1 flex flex-col px-[24px] pt-[32px] gap-[20px]">
        <h1
          className="text-[22px] font-bold text-[#111] leading-[1.2] w-full"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>

        {/* Dropdown */}
        <div
          ref={dropdownRef}
          className="relative w-full"
        >
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full h-[48px] bg-white border border-[#e5e5e5] rounded-[10px] px-[12px] flex items-center justify-between"
          >
            <span className="text-[16px] text-[#8c8c8c] font-normal">{t("placeholder")}</span>
            <svg
              width="14"
              height="8"
              viewBox="0 0 14 8"
              fill="none"
            >
              <path
                d="M1 1L7 7L13 1"
                stroke="#8C8C8C"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {open && (
            <div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-white border border-[#e5e5e5] rounded-[10px] shadow-md z-50 max-h-[240px] overflow-y-auto">
              {available.map((state) => (
                <button
                  key={state}
                  type="button"
                  onClick={() => addState(state)}
                  className="w-full px-[16px] py-[12px] text-left text-[16px] text-[#111] font-normal hover:bg-[#fafafa]"
                >
                  {state}
                </button>
              ))}
              {available.length === 0 && (
                <p className="px-[16px] py-[12px] text-[14px] text-[#8c8c8c]">All states selected</p>
              )}
            </div>
          )}
        </div>

        {/* Selected chips */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-[10px]">
            {selected.map((state) => (
              <div
                key={state}
                className="flex items-center gap-[8px] h-[36px] px-[12px] bg-[#fff1f9] border border-[#cc007e] rounded-[8px]"
              >
                <span className="text-[14px] font-medium text-[#cc007e] whitespace-nowrap">{state}</span>
                <button
                  type="button"
                  onClick={() => removeState(state)}
                  className="shrink-0"
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 11 11"
                    fill="none"
                  >
                    <path
                      d="M1 1L10 10M10 1L1 10"
                      stroke="#CC007E"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[393px] px-[24px] pb-[68px] bg-white">
        <button
          onClick={handleContinue}
          disabled={selected.length === 0}
          className={`w-full h-[56px] rounded-[16px] text-white text-[16px] font-semibold transition-opacity ${
            selected.length > 0 ? "bg-[#cc007e]" : "bg-[#cc007e] opacity-40 cursor-not-allowed"
          }`}
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {tc("continue")}
        </button>
      </div>
    </div>
  );
}
