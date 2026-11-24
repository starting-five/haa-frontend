"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";

export default function AmbassadorOnboardingFirstStepsPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("OnboardingAmbassadorFirstSteps");

  useRequireSessionKey("onboarding_ambassador_email", "/ambassadors/onboarding/phone");

  return (
    <div className="h-dvh flex flex-col max-w-[393px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showCallButton={false} />

      <main className="w-full min-h-0 flex-1 overflow-y-auto px-[24px] pt-[32px] pb-[24px]">
        <div className="flex flex-col">
          <h1
            className="text-[28px] font-extrabold leading-[34px] text-[#111827]"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("heading")}
          </h1>
        </div>

        <div className="relative mt-[16px] h-[415px] w-full rounded-[28px] shadow-none">
          <div className="absolute inset-x-0 top-[24px] inline-flex flex-col items-start justify-start">
            <div className="flex w-full flex-col items-start justify-start">
              <div className="mb-[-32px] inline-flex h-[136px] w-full items-start justify-start gap-[16px] rounded-[24px] p-[20px]">
                <div className="inline-flex w-[56px] flex-col items-center justify-start">
                  <div className="flex h-[56px] w-[56px] items-center justify-center rounded-[28px] bg-[#cc007e] shadow-[0px_1px_2px_rgba(0,0,0,0.30),0px_1px_3px_1px_rgba(0,0,0,0.15)]">
                    <p
                      className="text-center text-[28px] font-extrabold text-white"
                      style={{ fontFamily: "var(--font-nunito-sans)" }}
                    >
                      1
                    </p>
                  </div>
                  <div className="h-[72px] w-[2px] rounded-[1px] bg-[#f4c2d8]" />
                </div>

                <div className="inline-flex flex-1 flex-col items-start justify-start gap-[6px]">
                  <p
                    className="w-full text-[20px] font-bold leading-[28px] text-[#111827]"
                    style={{ fontFamily: "var(--font-nunito-sans)" }}
                  >
                    {t("step1Text")}
                  </p>
                </div>
              </div>

              <div className="mb-[-32px] inline-flex h-[134px] w-full items-start justify-start gap-[16px] rounded-[24px] p-[20px]">
                <div className="inline-flex w-[56px] flex-col items-center justify-start">
                  <div className="flex h-[56px] w-[56px] items-center justify-center rounded-[28px] bg-white shadow-[0px_1px_2px_rgba(0,0,0,0.30),0px_1px_3px_1px_rgba(0,0,0,0.15)]">
                    <p
                      className="text-center text-[28px] font-extrabold text-[#cc007e]"
                      style={{ fontFamily: "var(--font-nunito-sans)" }}
                    >
                      2
                    </p>
                  </div>
                  <div className="h-[72px] w-[2px] rounded-[1px] bg-[#f4c2d8]" />
                </div>

                <div className="inline-flex flex-1 flex-col items-start justify-start gap-[6px]">
                  <p
                    className="w-full text-[20px] font-bold leading-[28px] text-[#111827]"
                    style={{ fontFamily: "var(--font-nunito-sans)" }}
                  >
                    {t("step2Text")}
                  </p>
                </div>
              </div>

              <div className="relative h-[160px] w-full rounded-[24px]">
                <div className="absolute left-[48px] top-[20px] h-[81px] w-[67px] -translate-x-1/2">
                  <div className="absolute inset-[-0.89%_-1.75%_12.65%_-1.75%]">
                    <svg
                      className="block size-full"
                      fill="none"
                      height="71.468"
                      preserveAspectRatio="none"
                      viewBox="0 0 69.3476 71.468"
                      width="69.3476"
                    >
                      <g filter="url(#step3TriangleFilter)">
                        <path
                          d="M31.0643 8.27623C32.5137 5.24125 36.8339 5.24126 38.2833 8.27624L60.9522 55.7442C62.22 58.399 60.2846 61.468 57.3427 61.468H12.0049C9.06295 61.468 7.12757 58.399 8.39538 55.7442L31.0643 8.27623Z"
                          fill="white"
                        />
                      </g>
                      <defs>
                        <filter
                          colorInterpolationFilters="sRGB"
                          filterUnits="userSpaceOnUse"
                          height="71.468"
                          id="step3TriangleFilter"
                          width="69.3476"
                          x="0"
                          y="0"
                        >
                          <feFlood
                            floodOpacity="0"
                            result="BackgroundImageFix"
                          />
                          <feColorMatrix
                            in="SourceAlpha"
                            result="hardAlpha"
                            type="matrix"
                            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                          />
                          <feOffset dy="1" />
                          <feGaussianBlur stdDeviation="1" />
                          <feColorMatrix
                            type="matrix"
                            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.3 0"
                          />
                          <feBlend
                            in2="BackgroundImageFix"
                            mode="normal"
                            result="effect1_dropShadow"
                          />
                          <feColorMatrix
                            in="SourceAlpha"
                            result="hardAlpha"
                            type="matrix"
                            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                          />
                          <feMorphology
                            in="SourceAlpha"
                            operator="dilate"
                            radius="2"
                            result="effect2_dropShadow"
                          />
                          <feOffset dy="2" />
                          <feGaussianBlur stdDeviation="3" />
                          <feColorMatrix
                            type="matrix"
                            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.15 0"
                          />
                          <feBlend
                            in2="effect1_dropShadow"
                            mode="normal"
                            result="effect2_dropShadow"
                          />
                          <feBlend
                            in="SourceGraphic"
                            in2="effect2_dropShadow"
                            mode="normal"
                            result="shape"
                          />
                        </filter>
                      </defs>
                    </svg>
                  </div>

                  <div className="absolute inset-0 flex items-center justify-center">
                    <p
                      className="text-center text-[28px] font-extrabold leading-none text-[#cc007e]"
                      style={{ fontFamily: "var(--font-nunito-sans)" }}
                    >
                      3
                    </p>
                  </div>
                </div>

                <div className="absolute left-[92px] right-0 top-[36px] inline-flex h-[25px] flex-col items-start justify-start gap-[6px]">
                  <p
                    className="w-full text-[20px] font-bold leading-[28px] text-[#111827]"
                    style={{ fontFamily: "var(--font-nunito-sans)" }}
                  >
                    {t("step3Text")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <ScreenFooter
        label={t("cta")}
        onClick={() => router.push(`/${locale}/ambassadors/onboarding/introduce-yourself`)}
      />
    </div>
  );
}
