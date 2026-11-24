"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { ScreenHeader } from "@/components/layout/screen-header";
import { ScreenFooter } from "@/components/layout/screen-footer";
import { useParams, useRouter } from "next/navigation";
import { usePreloadImages } from "@/hooks/use-preload-images";
import { useRequireCompletedAgreement } from "@/hooks/use-require-completed-agreement";

// The dashboard that follows shows the doctor and attorney team tiles.
const NEXT_SCREEN_IMAGES = ["doctor-character", "attorney-character"].map((name) => `/assets/intake/${name}.webp`);

export default function IntakeConnectedPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeRetainerSigning");

  // The backend decides whether this screen may be shown. A submission id in
  // sessionStorage only means intake was submitted, not that anything was
  // signed, so it cannot be what gates a "you are connected" message.
  const agreementConfirmed = useRequireCompletedAgreement();
  usePreloadImages(NEXT_SCREEN_IMAGES);

  // Nothing is rendered until the backend confirms it, so an unsigned patient
  // never sees the success state even briefly.
  if (!agreementConfirmed) return <div className="h-dvh w-full bg-white" />;

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      <main className="flex-1 overflow-y-auto px-[24px] pb-[68px] flex flex-col items-center justify-center">
        <Image
          src="/assets/intake/haa-connected.webp"
          alt=""
          width={599}
          height={898}
          priority
          unoptimized
          decoding="sync"
          className="mb-[-28px] h-[449px] w-[322px] max-w-full object-contain"
        />

        <div className="flex w-[297px] max-w-full flex-col items-center gap-[12px] text-center">
          <h1
            className="w-full text-[36px] font-extrabold text-black leading-[0.95]"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("heading")}
          </h1>
          <p
            className="w-full text-[14px] font-normal text-[#cc007e]"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {t("subtext")}
          </p>
        </div>
      </main>

      <ScreenFooter
        label={t("cta")}
        onClick={() => router.push(`/${locale}/intake/thanks`)}
      />
    </div>
  );
}
