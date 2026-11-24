"use client";

import { FeatChecklist } from "@/components/landing-pages/feat-checklist";
import { FixedCta } from "@/components/landing-pages/fixed-cta";
import { Footer } from "@/components/landing-pages/footer";
import {
  HowItWorks,
  type HowItWorksStepCopy,
  type HowItWorksStepImage,
  withHowItWorksImages,
} from "@/components/landing-pages/how-it-works";
import { ScreenHeader } from "@/components/layout/screen-header";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";

const patientHowItWorksImages: HowItWorksStepImage[] = [
  {
    src: "/assets/patient-landing/tell-your-story-once.png",
    fit: "contain",
  },
  {
    src: "/assets/patient-landing/choose-doctor-or-lawyer.webp",
    fit: "contain",
  },
  "/assets/patient-landing/coordinate.png",
  {
    src: "/assets/patient-landing/track-and-control.png",
    fit: "contain",
    scale: 1.7,
  },
];

export default function PatientLanding({ locale }: { locale: string }) {
  const t = useTranslations("PatientLanding");
  const heroTitleItems = t.raw("heroTitleItems") as string[];
  const checklistHeading = t.raw("checklistHeading") as string[];
  const checklistItems = t.raw("checklistItems") as string[];
  const howItWorksSteps = withHowItWorksImages(
    t.raw("howItWorksSteps") as HowItWorksStepCopy[],
    patientHowItWorksImages
  );

  return (
    <div className="font-nunito bg-white">
      <ScreenHeader />
      <main
        id="main"
        className="min-h-screen bg-white"
      >
        <section className="mx-auto grid w-full max-w-[1680px] gap-9 px-5 py-[64px] pt-[56px]">
          <div className="flex min-w-0 items-start justify-start">
            <Image
              src="/assets/patient-landing/hero-accident-blocks.png"
              alt={t("heroAlt")}
              width={1397}
              height={655}
              loading="eager"
              className="block h-[260px] w-full object-contain object-left-top"
            />
          </div>
          <p className="m-0 mt-2 max-w-[640px] text-[18px] leading-[1.32]">{t("story")}</p>
          <div className="grid min-w-0 content-start justify-items-start">
            <h1 className="font-sans m-0 mb-10 text-[56px] font-[800] leading-[0.9]">
              <span className="block">{heroTitleItems[0]}</span>
              <span className="block">{heroTitleItems[1]}</span>
              <span className="block text-[#cc007e]">{heroTitleItems[2]}</span>
            </h1>
            <p className="m-0 max-w-[640px] text-[18px] leading-[1.32]">{t("lead")}</p>
            <div className="mt-10">
              <Link
                href={`/${locale}/get-help`}
                className="inline-flex min-h-[56px] min-w-[240px] items-center justify-center rounded-[16px] bg-[#cc007e] px-[22px] text-[18px] font-[700] text-white"
              >
                {t("cta")}
              </Link>
              <p className="m-0 mt-3 text-lg font-[700] text-[#6e6e73]">{t("ctaNote")}</p>
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
          closingText={t("howClosingText")}
          steps={howItWorksSteps}
          cta={{ label: t("cta"), href: `/${locale}/get-help` }}
        />
      </main>
      <Footer locale={locale} />
      <FixedCta
        href={`/${locale}/get-help`}
        label={t("cta")}
      />
    </div>
  );
}
