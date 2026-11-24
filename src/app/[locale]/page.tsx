"use client";

import PatientLanding from "@/components/landing-pages/patient-landing";
import { useParams } from "next/navigation";

export default function LocaleHome() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";

  return <PatientLanding locale={locale} />;
}
