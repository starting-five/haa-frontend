"use client";

import { BrandMarkBounce } from "@/components/brand-mark-bounce";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { SPLASH_DURATION_MS } from "@/lib/constants";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

export default function AmbassadorYouAreLivePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("OnboardingAmbassadorScanCredit");

  useRequireSessionKey("onboarding_ambassador_email", "/ambassadors/onboarding/phone");
  useRequireSessionKey("onboarding_ambassador_shortLink", "/ambassadors/onboarding/link");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      router.replace(`/${locale}/ambassadors/onboarding/first-steps`);
    }, SPLASH_DURATION_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [locale, router]);

  return (
    <div className="h-dvh flex flex-col items-center bg-white overflow-hidden">
      <StatusBarPlaceholder />

      <main className="w-full max-w-[393px] flex-1 overflow-y-auto px-[24px] pb-[78px]">
        <div className="flex min-h-full flex-col items-center justify-center gap-[24px]">
          <BrandMarkBounce>
            <div className="flex h-[150px] w-[150px] max-w-full items-center justify-center overflow-hidden rounded-[44px]">
              <Image
                src="/assets/logo/haa.png"
                alt=""
                width={150}
                height={150}
                priority
                className="h-auto w-[150px] max-w-full object-contain"
              />
            </div>
          </BrandMarkBounce>

          <div className="w-full max-w-[297px] text-center">
            <h1
              className="text-[36px] font-extrabold leading-[95%] text-black"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("heading")}
            </h1>
          </div>
        </div>
      </main>
    </div>
  );
}
