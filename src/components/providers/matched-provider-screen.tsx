"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ProviderScreen } from "@/components/providers/provider-screen";
import { attorneyStage } from "@/lib/attorney-stage";
import { teamMatches } from "@/lib/provider-matches";
import { PLACEHOLDER_ATTORNEY, PLACEHOLDER_DOCTOR } from "@/lib/providers";
import { getPatientDashboard } from "@/services/intake";

interface MatchedProviderScreenProps {
  kind: "attorney" | "doctor";
}

// A provider's screen, shown only once the backend's case says that provider is
// the patient's. The dashboard's greyed card is not a link, and this
// covers the address typed or kept from earlier: an unmatched provider, a case
// that cannot be read or no case at all all go back to the dashboard.
export function MatchedProviderScreen({ kind }: MatchedProviderScreenProps) {
  const t = useTranslations("IntakeDashboard");
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const [matched, setMatched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const backToDashboard = () => router.replace(`/${locale}/intake/dashboard`);

    getPatientDashboard()
      .then((dashboard) => {
        if (cancelled) return;
        const activeCase = dashboard.cases[0];
        // The attorney is the patient's once the retainer is signed, the same
        // rule the dashboard's card follows (lib/attorney-stage.ts); the doctor
        // only once the backend reports one matched.
        const shown = kind === "attorney" ? attorneyStage(activeCase) === "connected" : teamMatches(activeCase).doctor;
        if (shown) setMatched(true);
        else backToDashboard();
      })
      .catch(() => {
        if (!cancelled) backToDashboard();
      });

    return () => {
      cancelled = true;
    };
  }, [kind, locale, router]);

  if (!matched) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-white md:mx-auto md:max-w-[720px]">
        <p
          className="text-[14px] font-semibold text-[#6e6e73]"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          {t("loading")}
        </p>
      </div>
    );
  }

  return (
    <ProviderScreen
      kind={kind}
      provider={kind === "attorney" ? PLACEHOLDER_ATTORNEY : PLACEHOLDER_DOCTOR}
    />
  );
}
