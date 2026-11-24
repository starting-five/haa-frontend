"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  AGREEMENT_RETURN_MESSAGE,
  isEmbeddedInApplication,
  waitForAgreementCompletion,
} from "@/lib/agreement-completion";

/**
 * Where DocuSign sends the patient back to.
 *
 * DocuSign appends an event to this URL — signing_complete, cancel, decline
 * and so on. It arrives as a query parameter on a client-side redirect, so
 * anyone can type it. It is deliberately never read. The backend is asked what
 * actually happened, and only a server-confirmed 'completed' advances the flow.
 *
 * Signing happens inside the agreement screen, so this route normally loads
 * inside that screen's frame; there it only tells the screen the session is
 * over and leaves the check and the navigation to it. At the top level — a
 * bookmarked or retyped URL — it does the check itself.
 *
 * There is no Figma design for this route because the patient is never meant to
 * see it: it resolves the status and replaces itself in history, so Back skips
 * over it rather than landing on a screen that redirects again.
 */
export default function IntakeAgreementReturnPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();

  useEffect(() => {
    if (isEmbeddedInApplication()) {
      window.parent.postMessage({ type: AGREEMENT_RETURN_MESSAGE }, window.location.origin);
      return;
    }

    const submissionId = sessionStorage.getItem("intake_submissionId");
    if (!submissionId) {
      router.replace(`/${locale}/intake/phone`);
      return;
    }

    let cancelled = false;

    void waitForAgreementCompletion(submissionId, { isCancelled: () => cancelled }).then((outcome) => {
      if (cancelled) return;
      // A confirmed signature goes back to the dashboard (Figma 5366:15849),
      // which reads the signed case from the backend itself. Anything short of
      // completed goes back to the agreement rather than forward on a guess.
      router.replace(outcome === "completed" ? `/${locale}/intake/dashboard` : `/${locale}/intake/agreement`);
    });

    return () => {
      cancelled = true;
    };
  }, [locale, router]);

  // Nothing to render: no design exists for this step, and inventing one would
  // put an unreviewed screen in front of the patient.
  return <div className="h-dvh w-full bg-white" />;
}
