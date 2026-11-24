"use client";

import { IntakeTransition } from "@/components/intake/intake-transition";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";

export default function IntakeHelpIsOnTheWayPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const t = useTranslations("IntakeHelpIsOnTheWay");

  return (
    <IntakeTransition
      heading={t("heading")}
      nextPath={`/${locale}/intake`}
    />
  );
}
