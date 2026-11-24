"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { usePreloadImages } from "@/hooks/use-preload-images";
import { SPLASH_DURATION_MS } from "@/lib/constants";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

// The transition that follows bounces the brand mark.
const NEXT_SCREEN_IMAGES = ["/assets/logo/favicon.svg"] as const;

export default function SplashPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeSplash");

  usePreloadImages(NEXT_SCREEN_IMAGES);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      router.replace(`/${locale}/intake/help-is-on-the-way`);
    }, SPLASH_DURATION_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [locale, router]);

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      {/* Figma 1933:2201 — the content column is 24px in on each side and keeps
          68px clear of the footer; inside it the render and the title block are
          centred as one group. */}
      <div className="flex flex-1 flex-col items-center overflow-y-auto px-[24px] pb-[68px]">
        <div className="flex w-full flex-1 flex-col items-center justify-center">
          {/* HAACircle — 340 x 236 with the design's 44px corners; the render's
              own margins supply the space above the title. The screen is static:
              the frame's walk loop is deliberately not played here. */}
          <div className="flex h-[236px] w-[340px] max-w-full shrink-0 items-center justify-center rounded-[44px]">
            <Image
              src="/assets/intake/haa-splash.webp"
              alt=""
              width={680}
              height={453}
              priority
              unoptimized
              decoding="sync"
              className="h-auto w-full max-w-full object-contain"
            />
          </div>
          <div className="flex w-full flex-col items-center gap-[12px] text-center">
            <h1
              className="w-[297px] max-w-full text-[36px] font-extrabold leading-[95%] text-black"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("headingLine1")}
              <br />
              {t("headingLine2")}
            </h1>
            <p
              className="w-full text-[14px] font-normal text-[#CC007E]"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {t("subtext")}
            </p>
          </div>
        </div>
      </div>

      <ScreenFooter
        label={t("letsGo")}
        onClick={() => router.replace(`/${locale}/intake/help-is-on-the-way`)}
      />
    </div>
  );
}
