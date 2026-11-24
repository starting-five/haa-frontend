"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

const CHARACTER_SRC = "/assets/intake/haa-character.webp";

export default function IntakeReassurancePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeReassurance");

  useRequireSessionKey("intake_incidentLocation", "/intake/location");

  // The design fades the character in once it is there (Figma 1949:3715). The
  // fade starts from the load event — next/image fires it for an already
  // cached image too — so it always plays over a decoded picture rather than
  // over the download, and the character is never seen popping in mid-fade.
  const [characterLoaded, setCharacterLoaded] = useState(false);

  const handleGetStarted = () => {
    router.push(`/${locale}/intake/choose-path`);
  };

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      <main className="flex-1 overflow-y-auto flex flex-col items-center justify-center gap-[24px] px-[24px] pb-[68px]">
        {/* Character — the design frames the portrait render inside a 340px square */}
        <div className="flex h-[340px] w-[340px] max-w-full items-center justify-center">
          <Image
            src={CHARACTER_SRC}
            alt=""
            width={453}
            height={680}
            priority
            unoptimized
            decoding="sync"
            onLoad={() => setCharacterLoaded(true)}
            className={`h-[340px] w-auto object-contain ${
              characterLoaded ? "animate-haa-fade-in motion-reduce:animate-none" : "opacity-0 motion-reduce:opacity-100"
            }`}
          />
        </div>
        <h1
          className="w-[297px] max-w-full text-center text-[36px] font-extrabold leading-[0.95] text-[#000]"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>
      </main>

      <ScreenFooter
        label={t("getStarted")}
        onClick={handleGetStarted}
      />
    </div>
  );
}
