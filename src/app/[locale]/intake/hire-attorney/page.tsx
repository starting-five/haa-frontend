"use client";

import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import Image from "next/image";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { ScreenHeader } from "@/components/layout/screen-header";
import { usePreloadImages } from "@/hooks/use-preload-images";
import { useRequireSigningStep } from "@/hooks/use-require-signing-step";
import { SUPPORT_PHONE_TEL } from "@/lib/constants";
import { PLACEHOLDER_ATTORNEY } from "@/lib/providers";

// Signing returns to the dashboard, whose team cards draw these two renders.
const NEXT_SCREEN_IMAGES = ["/assets/intake/doctor-character.webp", "/assets/intake/attorney-character.webp"] as const;

export default function IntakeHireAttorneyPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeHireAttorney");
  const [submitting, setSubmitting] = useState(false);

  // Offered only once the admin has approved the case and until it is signed;
  // the matched attorney's Choose Attorney leads here (Figma 5366:15577 →
  // 5366:15645), and anyone else goes back to the dashboard.
  const signingStepConfirmed = useRequireSigningStep();
  usePreloadImages(NEXT_SCREEN_IMAGES);

  // With cacheComponents the App Router keeps this page in a hidden <Activity>
  // when the patient leaves, its state intact, and shows it again on the way
  // back. The guard covers only the navigation it started: once the page is
  // hidden that navigation has happened, so it is released here and a patient
  // who comes back finds the button live.
  useEffect(() => () => setSubmitting(false), []);

  // The agreement is presented and signed on the next screen (Figma 3225:12528);
  // nothing is created here, so a second tap while the route loads is harmless.
  // While DocuSign launch is disabled (see DOCUSIGN_LAUNCH_ENABLED) that screen
  // shows its signing notice instead of opening the ceremony.
  const handleSignAgreement = () => {
    if (submitting) return;
    setSubmitting(true);
    router.push(`/${locale}/intake/agreement`);
  };

  if (!signingStepConfirmed) return <div className="h-dvh w-full bg-white" />;

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      {/* Main Body — Figma 1968:2842: 24px under the header, 8px from the
          heading to the copy, 20px between the two paragraphs */}
      <div className="flex-1 overflow-y-auto px-[24px] pt-[24px] flex flex-col">
        <h1
          className="text-[28px] font-extrabold text-black leading-[1.04] w-full"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>

        <div className="mt-[8px] flex flex-col gap-[20px]">
          <p
            className="text-[14px] font-normal leading-[normal] text-[#cc007e] w-full"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {t.rich("freeNotice", {
              b: (chunks) => <span className="font-bold">{chunks}</span>,
            })}
          </p>
          <p
            className="text-[16px] font-normal text-[#4d4d4d] w-full"
            style={{
              fontFamily: "var(--font-nunito-sans)",
              fontStyle: "normal",
              lineHeight: "150%",
            }}
          >
            {t.rich("body", {
              firmName: PLACEHOLDER_ATTORNEY.name,
              firm: (chunks) => <span className="font-black">{chunks}</span>,
            })}
          </p>
        </div>

        {/* Attorney illustration — Figma 1968:2848: a 337px block 32px under the
            copy (the body's bottom padding), the render centred in it. Shrinks on
            short viewports so the button stays reachable. The frame's only
            animated layer, the HAA badge (3573:5080), is empty in the design and
            the render is badge-free, so there is nothing to animate here. */}
        <div className="mt-[32px] flex min-h-0 flex-1 justify-center">
          <Image
            src="/assets/intake/attorney-character.webp"
            alt=""
            width={222}
            height={337}
            priority
            unoptimized
            decoding="sync"
            className="h-full max-h-[337px] w-auto object-contain"
          />
        </div>
      </div>

      {/* Footer — Figma 1968:2849: 176px, the two actions centred in it */}
      <div className="flex h-[176px] w-full shrink-0 flex-col justify-center bg-white px-[24px] pt-[24px] pb-[57px]">
        <div className="flex flex-col gap-[12px]">
          <button
            type="button"
            onClick={handleSignAgreement}
            disabled={submitting}
            className={`h-[56px] w-full rounded-[16px] px-[24px] text-[16px] font-semibold ${
              submitting ? "bg-[#e5e5e5] text-[#8c8c8c] cursor-not-allowed" : "bg-brand text-white"
            }`}
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("signAgreement")}
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
    </div>
  );
}
