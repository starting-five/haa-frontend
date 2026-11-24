import type { PatientDashboard } from "@/contracts/intake";

type DashboardCase = PatientDashboard["cases"][number];

export interface TeamMatches {
  lawyer: boolean;
  doctor: boolean;
}

// Whether the patient's case has a lawyer and a doctor. The backend decides both
// (lib/provider-matches.ts there) from what it stores; this only reads the
// answer, so the dashboard's cards and the provider screens cannot disagree.
// Anything short of an explicit match — no case, or a backend that predates the
// field — reads as not matched, so a provider is never shown that is not there.
export function teamMatches(dashboardCase: DashboardCase | null | undefined): TeamMatches {
  return {
    lawyer: dashboardCase?.providers?.lawyer.matched === true,
    doctor: dashboardCase?.providers?.doctor.matched === true,
  };
}
