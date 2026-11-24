"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

export default function AmbassadorOnboardingPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const ta = useTranslations("OnboardingAmbassadorWelcome");

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
    };
  }, []);

  return (
    <div className="h-dvh max-h-dvh flex flex-col max-w-[393px] mx-auto overflow-hidden overscroll-none bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showCallButton={false} />

      <main className="flex-1 min-h-0 overflow-y-auto px-[24px]">
        <div className="flex min-h-full flex-col items-center justify-center gap-[20px] py-[20px]">
          <Image
            src="/assets/ambassador/onboarding/haa-ba-share.png"
            alt="HAA brand ambassador onboarding"
            width={358}
            height={438}
            loading="eager"
            priority
            className="h-auto w-full max-w-[358px] object-contain"
          />

          <div className="flex w-full max-w-[345px] flex-col items-center gap-[4px]">
            <h1
              className="w-full text-center text-[36px] font-extrabold leading-[95%]"
              style={{
                color: "var(--color-text-primary, #000)",
                fontFamily: '"Nunito Sans", var(--font-nunito-sans), sans-serif',
                fontStyle: "normal",
              }}
            >
              {ta("headline")}
            </h1>
            <p
              className="w-full text-center text-[14px] font-normal leading-normal"
              style={{
                color: "var(--color-primary-main, #CC007E)",
                fontFamily: "Inter, var(--font-inter), sans-serif",
                fontStyle: "normal",
              }}
            >
              {ta("subtext")}
            </p>
          </div>
        </div>
      </main>

      <ScreenFooter
        label={ta("cta")}
        onClick={() => router.push(`/${locale}/ambassadors/onboarding/name`)}
      />
    </div>
  );
}
