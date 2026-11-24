"use client";

import { BrandMarkBounce } from "@/components/brand-mark-bounce";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { SPLASH_DURATION_MS } from "@/lib/constants";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AmbassadorsGetStartedPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("OnboardingAmbassadorPrestart");

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push(`/${locale}/ambassadors/onboarding`);
    }, SPLASH_DURATION_MS);

    return () => clearTimeout(timer);
  }, [router, locale]);

  return (
    <div className="h-dvh flex flex-col max-w-[393px] mx-auto bg-white">
      <StatusBarPlaceholder />

      <main className="flex-1 flex flex-col items-center justify-center px-[24px] pb-[40px]">
        <BrandMarkBounce>
          <Image
            src="/assets/logo/haa.png"
            alt={t("logoAlt")}
            width={112}
            height={112}
            priority
            className="h-[112px] w-[112px] rounded-full"
          />
        </BrandMarkBounce>
        <h1
          className="mt-[18px] text-center text-[36px] font-extrabold leading-[0.9] text-[#1c1c1e]"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>
      </main>
    </div>
  );
}
