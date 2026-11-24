"use client";

import { ShareItScreen } from "@/components/ambassadors/share-it/share-it-screen";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";

export default function AmbassadorOnboardingShareItPage() {
  useRequireSessionKey("onboarding_ambassador_email", "/ambassadors/onboarding/phone");

  return <ShareItScreen variant="onboarding" />;
}
