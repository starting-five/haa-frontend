"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { IntakeTransition } from "@/components/intake/intake-transition";
import { usePreloadImages } from "@/hooks/use-preload-images";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";

// The accident screen that follows opens on its eight rendered tiles.
const NEXT_SCREEN_IMAGES = [
  "/assets/intake/incident/car.webp",
  "/assets/intake/incident/motorcycle.webp",
  "/assets/intake/incident/truck.webp",
  "/assets/intake/incident/rideshare.webp",
  "/assets/intake/incident/slip-fall.webp",
  "/assets/intake/incident/pedestrian.webp",
  "/assets/intake/incident/bicycle.webp",
  "/assets/intake/incident/other.webp",
] as const;

/**
 * Figma 4817:19579 (P-302). The beat between the code being accepted and the
 * first question about the crash: it confirms what just happened and names
 * what comes next, then moves on by itself.
 */
export default function IntakeVerifiedPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const t = useTranslations("IntakeVerified");

  // The submission id is written only once the code has been accepted and the
  // case opened, so it is what proves verification happened. A refused code
  // never writes it, which is what keeps this screen behind the code screen.
  useRequireSessionKey("intake_submissionId", "/intake/phone");
  usePreloadImages(NEXT_SCREEN_IMAGES);

  return (
    <IntakeTransition
      heading={t("heading")}
      subtext={t("subtext")}
      nextPath={`/${locale}/intake/incident`}
      variant="verified"
    />
  );
}
