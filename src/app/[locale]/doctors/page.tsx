"use client";

import { BlindSpots } from "@/components/landing-pages/blind-spots";
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
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";

const doctorHowItWorksImages: HowItWorksStepImage[] = [
  { src: "/assets/doctor-landing/doctor-step-1.png", fit: "cover" },
  { src: "/assets/doctor-landing/doctor-step-2.png", fit: "cover" },
  { src: "/assets/doctor-landing/doctor-step-3.png", fit: "cover" },
  { src: "/assets/doctor-landing/doctor-step-4.png", fit: "cover" },
];

export default function DoctorsPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const t = useTranslations("DoctorsLanding");
  const heroTitleItems = t.raw("heroTitleItems") as string[];
  const checklistHeading = t.raw("checklistHeading") as string[];
  const checklistItems = t.raw("checklistItems") as string[];
  const blindItems = t.raw("blindItems") as string[];
  const howItWorksSteps = withHowItWorksImages(
    t.raw("howItWorksSteps") as HowItWorksStepCopy[],
    doctorHowItWorksImages
  );

  return (
    <div className="font-nunito min-h-screen bg-white">
      <ScreenHeader />

      <main id="main">
        <section className="mx-auto grid max-h-screen w-full max-w-[1280px] gap-6 px-5 pb-[94px] pt-14">
          <div className="flex h-[260px] w-full">
            <Image
              src="/assets/doctor-landing/hero-doctor.png"
              alt={t("heroAlt")}
              width={604}
              height={1355}
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
                // Will be updated once the actual onboarding is implemented.
                href="#"
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
        <BlindSpots
          title={t("blindTitle")}
          items={blindItems}
          suffix={t("blindSuffix")}
        />
        <HowItWorks
          title={t("howTitle")}
          lead={t("howLead")}
          closingText={t("howClosingText")}
          closingSubtext={t("howClosingSubtext")}
          // Will be updated once the actual onboarding is implemented.
          cta={{ label: t("cta").toUpperCase(), href: "#" }}
          steps={howItWorksSteps}
        />
      </main>
      <Footer locale={locale} />
      <FixedCta
        href="#"
        label={t("cta")}
      />
    </div>
  );
}
