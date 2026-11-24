"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { IntakeTransition } from "@/components/intake/intake-transition";
import { usePreloadImages } from "@/hooks/use-preload-images";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";

// The evidence screen that follows opens on the device render and its four category icons.
const NEXT_SCREEN_IMAGES = [
  "/assets/intake/haa-device-card-220.webp",
  "/assets/intake/evidence/report.png",
  "/assets/intake/evidence/pictures.png",
  "/assets/intake/evidence/insurance.png",
  "/assets/intake/evidence/license.png",
] as const;

export default function IntakeProtectCasePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const t = useTranslations("IntakeProtectCase");

  useRequireSessionKey("intake_residence", "/intake/residence");
  usePreloadImages(NEXT_SCREEN_IMAGES);

  return (
    <IntakeTransition
      heading={t("heading")}
      subtext={t("subtext")}
      nextPath={`/${locale}/intake/evidence`}
      showHeader
      illustration={{
        src: "/assets/intake/haa-protect.webp",
        width: 512,
        height: 770,
        className: "h-[385px] w-[345px] rounded-[44px]",
      }}
    />
  );
}
