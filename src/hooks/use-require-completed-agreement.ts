"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAgreementStatus } from "@/services/intake";
import { DOCUSIGN_LAUNCH_ENABLED } from "@/lib/constants";

/**
 * Lets a screen show the signed-and-connected state only once the backend says
 * the agreement really is completed.
 *
 * `useRequireSessionKey` is not enough here. It checks that a submission id is
 * in sessionStorage, which is true from the moment intake is submitted — so a
 * patient who has not signed anything could reach the success screen by typing
 * its URL, and would be told they were connected to an attorney when no
 * agreement existed. The id is navigation state; only the backend knows whether
 * an envelope was completed.
 *
 * Returns false until the backend has confirmed it, so the caller can withhold
 * the screen rather than showing it and then navigating away.
 */
export function useRequireCompletedAgreement(): boolean {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const submissionId = sessionStorage.getItem("intake_submissionId");
    if (!submissionId) {
      router.replace(`/${locale}/intake/phone`);
      return;
    }

    // With DocuSign launch disabled there is no agreement to have completed;
    // a submitted case is the whole precondition (see DOCUSIGN_LAUNCH_ENABLED).
    if (!DOCUSIGN_LAUNCH_ENABLED) {
      setConfirmed(true);
      return;
    }

    let cancelled = false;

    void (async () => {
      const result = await getAgreementStatus(submissionId).catch(() => null);
      if (cancelled) return;

      if (result?.ok && result.status === "completed") {
        setConfirmed(true);
        return;
      }

      // Anything else — unsigned, declined, voided, or a backend that refused
      // the request — sends the patient back to the signing step. Failing
      // closed matters more than guessing: the alternative is telling someone
      // their case is handled when it is not.
      router.replace(`/${locale}/intake/hire-attorney`);
    })();

    return () => {
      cancelled = true;
    };
  }, [locale, router]);

  return confirmed;
}
