"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { INTAKE_SUBMITTED_KEY } from "@/lib/intake-session";

// Bounces the user back into the intake flow if a prior step's data is
// missing, so a raw URL can't be used to jump into the middle of the flow.
//
// Once the case is submitted the answers are cleared on purpose, so every
// pre-submit screen fails this check. Sending the patient to the step before
// it would only fail there too and cascade to the first unguarded screen —
// which is how Back from choose-attorney used to land on choose-path. A
// submitted case forwards to where the post-submit flow starts instead: the
// dashboard, which shows the case in review and sends it on to the agreement
// once the admin has accepted it.
export function useRequireSessionKey(key: string, fallbackPath: string) {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(key)) return;

    const submitted =
      Boolean(sessionStorage.getItem(INTAKE_SUBMITTED_KEY)) && Boolean(sessionStorage.getItem("intake_submissionId"));
    router.replace(submitted ? `/${locale}/intake/dashboard` : `/${locale}${fallbackPath}`);
  }, [key, fallbackPath, locale, router]);
}
