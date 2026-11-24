"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { ScreenHeader } from "@/components/layout/screen-header";
import { ScreenFooter } from "@/components/layout/screen-footer";
import { useParams, useRouter } from "next/navigation";

export default function IntakeYouAreConnectedPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeRetainerSigning");

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      <main className="flex-1 overflow-y-auto px-[24px] pb-[68px] flex flex-col items-center justify-center">
        <Image
          src="/assets/intake/haa-guide.png"
          alt=""
          width={345}
          height={385}
          priority
          sizes="259px"
          className="h-auto w-[259px] object-contain"
        />

        <div className="mt-[12px] flex w-full flex-col items-center gap-[12px] text-center">
          <p
            className="w-full text-[36px] font-extrabold text-black leading-[0.95]"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("heading")}
          </p>
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
        onClick={() => router.push(`/${locale}/intake/dashboard`)}
      />
    </div>
  );
}
