import {
  claimIntakeForUser,
  getIntakeResumePath,
  restoreIntakeResumeDraft,
  seedIntakeIdentityFromAuth,
} from "@/lib/intake-session";
import { getPatientIntakeResume, PatientDashboardUnavailableError } from "@/services/intake";

export type IntakeResumeOutcome =
  // a claimant who passed verification and stopped before submitting: where to put them back
  | { kind: "resume"; path: string }
  // no claimant at all — a number that never started the intake, or an
  // ambassador-only account — so login treats it as not registered
  | { kind: "none" }
  // the backend could not say; the caller keeps the patient where they are
  | { kind: "failed" };

/**
 * For a signed-in number with no submitted case, decides whether it is a
 * patient who passed OTP and abandoned the intake, and if so restores their
 * draft into the tab and returns the furthest safe step to resume from.
 * GET /patient/intake-resume answers from the session: 409 intake_incomplete
 * when the account has no claimant, the claimant and any open submission
 * otherwise.
 */
export async function resumeAbandonedIntake(
  storage: Storage,
  locale: string,
  identity: { userId: string; phone: string; email?: string | null; userMetadata?: unknown }
): Promise<IntakeResumeOutcome> {
  let resume;
  try {
    resume = await getPatientIntakeResume();
  } catch (error) {
    if (error instanceof PatientDashboardUnavailableError && error.code === "intake_incomplete") {
      return { kind: "none" };
    }
    return { kind: "failed" };
  }
  if (!resume.patient) return { kind: "none" };

  // whatever this tab held for another account goes before anything is restored
  claimIntakeForUser(storage, identity.userId, { keepEnteredIdentity: false });
  restoreIntakeResumeDraft(storage, identity.phone, identity.userId);
  seedIntakeIdentityFromAuth(storage, identity);

  // what the backend holds wins over the tab's copy
  const fromBackend: Record<string, string | null | undefined> = {
    intake_firstName: resume.patient.firstName,
    intake_lastName: resume.patient.lastName,
    intake_phone: resume.patient.mobile,
    intake_email: resume.patient.email,
    intake_submissionId: resume.submissionId,
  };
  for (const [key, value] of Object.entries(fromBackend)) {
    const trimmed = value?.trim() ?? "";
    if (trimmed) storage.setItem(key, trimmed);
  }

  return { kind: "resume", path: getIntakeResumePath(storage, locale) };
}
