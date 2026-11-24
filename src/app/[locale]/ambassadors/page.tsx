"use client";

import { FeatChecklist } from "@/components/landing-pages/feat-checklist";
import { FixedCta } from "@/components/landing-pages/fixed-cta";
import { Footer } from "@/components/landing-pages/footer";
import { HowItWorks, type HowItWorksStepCopy, withHowItWorksImages } from "@/components/landing-pages/how-it-works";
import { ScreenHeader } from "@/components/layout/screen-header";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

const ambassadorHowItWorksImages = [
  "/assets/patient-landing/tell-your-story-once.webp",
  "/assets/patient-landing/choose-attorney-or-doctor.webp",
  "/assets/patient-landing/coordinate.webp",
  "/assets/patient-landing/track-and-control.webp",
];

export default function AmbassadorsPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const t = useTranslations("AmbassadorsLanding");
  const heroTitleItems = t.raw("heroTitleItems") as string[];
  const checklistHeading = t.raw("checklistHeading") as string[];
  const checklistItems = t.raw("checklistItems") as string[];
  const howItWorksSteps = withHowItWorksImages(
    t.raw("howItWorksSteps") as HowItWorksStepCopy[],
    ambassadorHowItWorksImages
  );

  return (
    <div className="font-nunito min-h-screen bg-white">
      <ScreenHeader />

      <main id="main">
        <section className="mx-auto grid max-h-screen w-full max-w-[1280px] gap-6 px-5 pb-[94px] pt-14">
          <div className="flex h-[260px] w-full">
            <Image
              src="/assets/ambassador/landing/hero-brand-ambassador.png"
              alt={t("heroAlt")}
              width={582}
              height={1189}
              loading="eager"
              priority
              className="block h-full w-full object-contain"
            />
          </div>
          <div className="contents max-w-[640px]">
            <h1 className="font-nunito order-1 max-w-full text-[18px] font-semibold leading-[0.9] tracking-[-0.04em]">
              {t("heroTitle")}
            </h1>
            <p className="font-sans order-2 mt-3 text-[56px] font-[800] leading-[0.9]">
              <span className="block">{heroTitleItems[0]}</span>
              <span className="block text-black">{heroTitleItems[1]}</span>
              <span className="block text-[#cc007e]">{heroTitleItems[2]}</span>
            </p>
            <p className="font-nunito order-3 text-[22px] font-[500] leading-[1.4] text-[#555555]">{t("story")}</p>
            <div className="order-4 mt-2.5">
              <Link
                href={`/${locale}/ambassadors/language-selector`}
                className="font-nunito inline-flex min-h-[56px] w-[240px] items-center justify-center rounded-[16px] bg-[#cc007e] px-[22px] text-[18px] font-[700] text-white"
              >
                {t("cta")}
              </Link>
            </div>
          </div>
        </section>

        <FeatChecklist
          heading={checklistHeading}
          items={checklistItems}
        />
        <HowItWorks
          title={t("howTitle")}
          lead={t("howLead")}
          cta={{ label: t("cta").toUpperCase(), href: `/${locale}/ambassadors/language-selector` }}
          steps={howItWorksSteps}
        />
      </main>
      <Footer locale={locale} />
      <FixedCta
        href={`/${locale}/ambassadors/language-selector`}
        label={t("cta")}
      />
    </div>
  );
}
