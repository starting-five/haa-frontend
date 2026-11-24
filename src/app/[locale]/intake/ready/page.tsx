"use client";

import { IntakeTransition } from "@/components/intake/intake-transition";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";

export default function IntakeReadyPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const t = useTranslations("IntakeReady");

  return (
    <IntakeTransition
      heading={t("heading")}
      subtext={t("subtext")}
      variant="ready"
      nextPath={`/${locale}/intake/dashboard`}
    />
  );
}
