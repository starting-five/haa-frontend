"use client";

import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { ScreenHeader } from "@/components/layout/screen-header";
import { usePreloadImages } from "@/hooks/use-preload-images";
import { useRequireSigningStep } from "@/hooks/use-require-signing-step";
import { SUPPORT_PHONE_TEL } from "@/lib/constants";
import { PLACEHOLDER_ATTORNEY } from "@/lib/providers";

// Prewarm the hire-attorney illustration so it does not pop in on the next screen.
const NEXT_SCREEN_IMAGES = ["/assets/intake/attorney-character.webp"] as const;

/**
 * The matched attorney — Figma 5366:15577. Reached from the dashboard's
 * Recommended attorney card or its "View matched attorney", once the Admin
 * Dashboard has approved the case for the retainer; Choose Attorney goes on to
 * Hire Your Attorney and the signing it opens.
 *
 * Shown only while the backend says the case is waiting for the patient's
 * signature — the same rule as Hire Your Attorney and as the backend's own
 * refusal to open a signing session for any other case. A case in review, signed
 * or closed goes back to the dashboard.
 *
 * "Choose my own attorney" is drawn, marked coming soon, and is a disabled button
 * with no handler: it cannot navigate, submit or change the matched firm.
 */
export default function IntakeChooseAttorneyPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeChooseAttorney");
  const [choosing, setChoosing] = useState(false);

  const signingStepConfirmed = useRequireSigningStep();
  usePreloadImages(NEXT_SCREEN_IMAGES);

  // With cacheComponents the App Router keeps this page in a hidden <Activity>
  // when the patient leaves, its state intact, and shows it again on the way
  // back. The guard covers only the navigation it started: once the page is
  // hidden that navigation has happened, so it is released here and a patient
  // who comes back finds the button live.
  useEffect(() => () => setChoosing(false), []);

  const reasons = ["caseTypeMatch", "winningPercentage", "responsiveness"] as const;

  const handleChoose = () => {
    if (choosing) return;
    setChoosing(true);
    router.push(`/${locale}/intake/hire-attorney`);
  };

  if (!signingStepConfirmed) return <div className="h-dvh w-full bg-white" />;

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader />

      <div className="flex-1 overflow-y-auto px-[24px] pt-[32px] flex flex-col gap-[20px]">
        {/* Title block */}
        <div className="flex flex-col gap-[4px]">
          <h1
            className="text-[28px] font-extrabold text-black leading-[1.04] w-full"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("heading")}
          </h1>
          <p
            className="text-[15px] font-normal leading-[1.6] text-[#5c5c5c] w-full"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {t("subtext")}
          </p>
        </div>

        {/* Attorney details */}
        <div className="flex flex-col gap-[20px]">
          <p
            className="text-[24px] font-extrabold leading-[1.2] text-[#cc007e]"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {PLACEHOLDER_ATTORNEY.name}
          </p>

          <div className="flex flex-col gap-[12px]">
            <p
              className="text-[16px] font-extrabold text-black leading-[1.3]"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("whyGreatMatch")}
            </p>
            <ul className="flex flex-col gap-[12px] pl-[8px]">
              {reasons.map((reason) => (
                <li
                  key={reason}
                  className="flex items-center gap-[12px] w-full"
                >
                  <Check
                    size={16}
                    className="text-[#cc007e] shrink-0"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  <span
                    className="text-[14px] font-light text-black leading-[1.5]"
                    style={{ fontFamily: "var(--font-inter)" }}
                  >
                    {t(reason)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Footer — Figma 5366:15611: 24px over and 32px under, 12px between */}
      <div className="flex w-full shrink-0 flex-col gap-[12px] bg-white px-[24px] pt-[24px] pb-[32px]">
        <button
          type="button"
          onClick={handleChoose}
          disabled={choosing}
          className={`h-[56px] w-full rounded-[16px] px-[24px] text-[16px] font-semibold ${
            choosing ? "bg-[#e5e5e5] text-[#8c8c8c] cursor-not-allowed" : "bg-brand text-white"
          }`}
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("continue")}
        </button>

        <button
          type="button"
          disabled
          className="h-[56px] w-full cursor-not-allowed rounded-[12px] bg-[#f8f8f8] px-[24px] text-[16px] leading-[15px] text-[#1a1a1a]"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          <span className="font-semibold">{t("chooseOwn")}</span>{" "}
          <span className="font-normal italic">{t("comingSoon")}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            window.location.href = SUPPORT_PHONE_TEL;
          }}
          className="w-full text-center text-[14px] font-semibold leading-[15px] text-[#58585c] underline"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("speakToSomeone")}
        </button>
      </div>
    </div>
  );
}
