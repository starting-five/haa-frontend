"use client";

import { IntakeTransition } from "@/components/intake/intake-transition";
import { useRequireCompletedAgreement } from "@/hooks/use-require-completed-agreement";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";

// The "Thank you for trusting us" interstitial (Figma 3100-5083) shown between
// the connected screen and the dashboard. It is the shared IntakeTransition, so
// it advances on the shared SPLASH_DURATION_MS and replaces itself in history.
export default function IntakeThanksPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const t = useTranslations("IntakeThanks");

  // Same backend-confirmed gate the connected screen before it uses, so a typed
  // URL never reaches this over an unsigned case.
  const agreementConfirmed = useRequireCompletedAgreement();
  if (!agreementConfirmed) return <div className="h-dvh w-full bg-white" />;

  return (
    <IntakeTransition
      heading={t("heading")}
      nextPath={`/${locale}/intake/dashboard`}
    />
  );
}
