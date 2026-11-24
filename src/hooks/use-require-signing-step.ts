"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isAwaitingSignature, rememberCaseForSigning } from "@/lib/signing-step";
import { getPatientDashboard } from "@/services/intake";

/**
 * Lets the Hire Your Attorney screen show only while the backend says the
 * patient's case is waiting for their signature — accepted by the admin and not
 * yet signed.
 *
 * A submission id in sessionStorage is not enough: it is there from the moment
 * the case is submitted, long before anyone has reviewed it, and it would let a
 * typed URL offer a retainer for a case still in review. Anything other than a
 * confirmed "waiting for a signature" — in review, turned down, already signed,
 * no case, or no answer at all — returns the patient to the dashboard, which
 * shows where the case stands. The backend refuses to open a signing session
 * for any of those cases too; this only keeps the screen honest.
 *
 * Returns false until confirmed, so the caller withholds the screen rather than
 * showing it and then navigating away. That holds on every visit: a screen the
 * App Router restores from a hidden <Activity> (cacheComponents) keeps its
 * state, so the answer is dropped when the screen is left and asked again on
 * the way back — a case signed or withdrawn meanwhile is never offered again.
 */
export function useRequireSigningStep(): boolean {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const dashboard = await getPatientDashboard().catch(() => null);
      const activeCase = dashboard?.cases[0];
      const awaiting = await isAwaitingSignature(activeCase);
      if (cancelled) return;

      if (!activeCase || !awaiting) {
        router.replace(`/${locale}/intake/dashboard`);
        return;
      }

      rememberCaseForSigning(sessionStorage, activeCase);
      setConfirmed(true);
    })();

    return () => {
      cancelled = true;
      setConfirmed(false);
    };
  }, [locale, router]);

  return confirmed;
}
