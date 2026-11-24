import type { PatientDashboard } from "@/contracts/intake";

type DashboardCase = PatientDashboard["cases"][number];

/**
 * Where the patient stands with their attorney, read from the case status the
 * backend returns (GET /patient/dashboard) and nothing else.
 *
 *   none         still in review, or closed without representation — the
 *                dashboard is "Finding your attorney" and names no one
 *   recommended  the Admin Dashboard approved the case for the retainer
 *                (retainer_pending_signature): the firm is offered, not hired
 *   connected    the retainer is signed (signed), and every status the case can
 *                reach from there while represented
 *
 * Each status is listed by its exact value. A status this list does not know is
 * "none": an attorney is never shown on a guess, and "retainer_pending_signature"
 * must never read as signed because it happens to contain "sign".
 *
 * Who the firm is comes from lib/providers.ts. The backend stores no attorney
 * per case yet; when it does, the name moves there and this rule stays.
 */
export type AttorneyStage = "none" | "recommended" | "connected";

const RECOMMENDED_STATUSES: ReadonlySet<string> = new Set(["retainer_pending_signature"]);
const CONNECTED_STATUSES: ReadonlySet<string> = new Set(["signed", "attorney", "qualified", "doctor"]);

export function attorneyStage(dashboardCase: DashboardCase | null | undefined): AttorneyStage {
  const status = dashboardCase?.status?.trim().toLowerCase() ?? "";
  if (RECOMMENDED_STATUSES.has(status)) return "recommended";
  if (CONNECTED_STATUSES.has(status)) return "connected";
  return "none";
}
