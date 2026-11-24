"use client";

import { IntakeTransition } from "@/components/intake/intake-transition";
import { useRequireCompletedAgreement } from "@/hooks/use-require-completed-agreement";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";

export default function IntakeThankYouPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const t = useTranslations("IntakeThankYou");

  // Reached from the DocuSign return route once the backend has confirmed the
  // envelope. The check is repeated here rather than trusted from the route
  // before, so a typed URL never shows "we've got it" over an unsigned case.
  const agreementConfirmed = useRequireCompletedAgreement();

  if (!agreementConfirmed) return <div className="h-dvh w-full bg-white" />;

  return (
    <IntakeTransition
      heading={t("heading")}
      nextPath={`/${locale}/intake/connected`}
    />
  );
}
