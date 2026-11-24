"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BrandMarkBounce } from "@/components/brand-mark-bounce";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { Logo } from "@/components/logo";
import { SPLASH_DURATION_MS } from "@/lib/constants";

interface IntakeTransitionIllustration {
  src: string;
  width: number;
  height: number;
  className?: string;
}

/**
 * The design file draws these interstitials at two scales. The splash screens
 * carry the large heading with a magenta line under it. The moment after the
 * code is accepted (Figma 4817:19579) is set smaller and quieter —
 * HAA/Heading/H2 at 28/800 over Subtitle/Regular in Subtitle grey, the mark a
 * little larger, and both gaps drawn tighter.
 */
const VARIANTS = {
  splash: {
    markSize: 141,
    stackGap: "gap-[32px]",
    titleGap: "gap-[12px]",
    heading: "text-[36px] font-extrabold leading-[95%] text-black",
    subtext: "text-[14px] font-normal leading-normal text-[#cc007e]",
  },
  verified: {
    markSize: 150,
    stackGap: "gap-[24px]",
    titleGap: "gap-[8px]",
    heading: "text-[28px] font-extrabold leading-[104%] text-black",
    subtext: "text-[16px] font-normal leading-normal text-[#5c5c5c]",
  },
  ready: {
    markSize: 150,
    stackGap: "gap-[24px]",
    titleGap: "gap-[6px]",
    heading: "text-[36px] font-extrabold leading-[95%] text-[#111827]",
    subtext: "text-[15px] font-normal leading-[22px] text-[#4b5563]",
  },
} as const;

interface IntakeTransitionProps {
  heading: string;
  /** Secondary line under the heading. The variant decides how it is set. */
  subtext?: string;
  /** Locale-prefixed path the flow continues to once the delay elapses. */
  nextPath: string;
  /** Show the logo header. The mark-only screens have none. */
  showHeader?: boolean;
  /**
   * A character illustration in place of the bouncing brand mark. Point it at
   * a pre-sized static asset: the interstitial lasts 2.5 s, so there is no
   * time for an on-demand resize.
   */
  illustration?: IntakeTransitionIllustration;
  /** Which of the design's two interstitial scales to draw. */
  variant?: keyof typeof VARIANTS;
}

/**
 * Buttonless interstitial that moves the flow on by itself after the shared
 * SPLASH_DURATION_MS. It replaces itself in history so Back skips over it
 * rather than landing on a screen that immediately advances again. Every
 * auto-advancing patient-flow screen renders this rather than keeping its own
 * timer, and the same shared duration is used by other transition screens.
 */
export function IntakeTransition({
  heading,
  subtext,
  nextPath,
  showHeader = false,
  illustration,
  variant = "splash",
}: IntakeTransitionProps) {
  const router = useRouter();
  const design = VARIANTS[variant];

  useEffect(() => {
    // The next route's payload is fetched while the screen is showing, so the
    // hand-off happens at the delay rather than a round trip after it.
    router.prefetch(nextPath);
    const timer = window.setTimeout(() => router.replace(nextPath), SPLASH_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [router, nextPath]);

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      {showHeader && <ScreenHeader showLanguageSelector={false} />}

      <div
        className={`flex flex-1 flex-col items-center justify-center px-[24px] ${illustration ? "gap-[12px]" : design.stackGap}`}
      >
        {illustration ? (
          <Image
            src={illustration.src}
            alt=""
            width={illustration.width}
            height={illustration.height}
            priority
            unoptimized
            decoding="sync"
            className={`max-w-full object-contain ${illustration.className ?? ""}`}
          />
        ) : (
          <BrandMarkBounce>
            <Logo
              variant="icon"
              width={design.markSize}
              height={design.markSize}
              priority
            />
          </BrandMarkBounce>
        )}

        <div className={`flex flex-col items-center text-center ${design.titleGap}`}>
          <h1
            className={design.heading}
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {heading}
          </h1>
          {subtext && (
            <p
              className={design.subtext}
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {subtext}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
