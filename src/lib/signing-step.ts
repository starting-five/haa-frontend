import { INTAKE_SUBMITTED_KEY } from "@/lib/intake-session";
import { getAgreementStatus, type PatientDashboard } from "@/services/intake";

type DashboardCase = PatientDashboard["cases"][number];

/**
 * Whether the patient's next step is signing the retainer for this case.
 *
 * The backend decides it: `awaitingSignature` is true once the Admin Dashboard
 * has accepted the case and until its agreement is completed. The dashboard
 * reports the agreement status as stored, though, and an envelope signed just
 * before the app was closed stays "sent" there until something asks DocuSign.
 * The status route does and records the answer, so an envelope that is already
 * out is checked there first — a patient who has signed is never sent back to
 * sign again. A failed check leaves the backend's answer standing.
 */
export async function isAwaitingSignature(activeCase: DashboardCase | undefined): Promise<boolean> {
  if (!activeCase?.awaitingSignature) return false;
  if (activeCase.agreementStatus !== "sent" && activeCase.agreementStatus !== "delivered") return true;

  const latest = await getAgreementStatus(activeCase.submissionId).catch(() => null);
  return !(latest?.ok && latest.status === "completed");
}

/**
 * Whether a case the dashboard still reads as waiting for its signature has in
 * fact been signed. The backend moves a case to 'signed' when it learns the
 * envelope completed, and it learns that from the agreement status route; a
 * patient who closed DocuSign before the app heard back would otherwise be
 * offered the attorney again on a signed retainer. True only when that route
 * says completed — the caller then reads the dashboard again for the case the
 * backend now holds. A failed check leaves the dashboard's answer standing.
 */
export async function signedSinceLastRead(activeCase: DashboardCase | undefined): Promise<boolean> {
  if (activeCase?.status !== "retainer_pending_signature") return false;
  if (!["sent", "delivered", "completed"].includes(activeCase.agreementStatus ?? "")) return false;

  const latest = await getAgreementStatus(activeCase.submissionId).catch(() => null);
  return Boolean(latest?.ok && latest.status === "completed");
}

/**
 * The agreement screens read the case from sessionStorage. A patient who has
 * signed in again, or opened a new tab, has nothing there, so the backend's
 * case is written before they are sent on. Navigation state only: every
 * agreement request is checked for ownership and acceptance on the backend.
 */
export function rememberCaseForSigning(storage: Storage, activeCase: DashboardCase): void {
  storage.setItem("intake_submissionId", activeCase.submissionId);
  storage.setItem(INTAKE_SUBMITTED_KEY, "1");
}
