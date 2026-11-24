import { getAgreementStatus } from "@/services/intake";

// DocuSign reports the session as ended the moment the signer finishes, which
// can run marginally ahead of the envelope being marked completed. A couple of
// short retries cover that gap without making the wait feel slow; the worst
// case is under two seconds before giving up.
export const COMPLETION_ATTEMPTS = 3;
export const COMPLETION_RETRY_MS = 800;

export type AgreementOutcome = "completed" | "declined" | "pending";

export interface CompletionWaitOptions {
  /** Lets a caller that has unmounted stop the wait; the answer is then "pending". */
  isCancelled?: () => boolean;
  /** How many times to ask. A session that ended without a signature needs only one. */
  attempts?: number;
}

/**
 * Asks the backend whether the patient's agreement is really completed. This
 * is the only thing that may move the flow past signing: neither DocuSign's
 * session-end event in the browser nor the event it appends to the return URL
 * is trusted on its own.
 *
 * `declined` covers the final states (declined, voided) that waiting cannot
 * change; `pending` is anything else after the last attempt.
 */
export async function waitForAgreementCompletion(
  submissionId: string,
  { isCancelled = () => false, attempts = COMPLETION_ATTEMPTS }: CompletionWaitOptions = {}
): Promise<AgreementOutcome> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await getAgreementStatus(submissionId).catch(() => null);
    if (isCancelled()) return "pending";

    if (result?.ok && result.status === "completed") return "completed";
    if (result?.ok && (result.status === "declined" || result.status === "voided")) return "declined";

    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, COMPLETION_RETRY_MS));
      if (isCancelled()) return "pending";
    }
  }

  return "pending";
}

/** Sent by the return route to the agreement screen when DocuSign lands it inside that screen's frame. */
export const AGREEMENT_RETURN_MESSAGE = "haa:agreement-return";

/** True when this document is being shown inside another document of the application. */
export function isEmbeddedInApplication(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
