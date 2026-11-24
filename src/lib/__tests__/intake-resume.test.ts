import { beforeEach, describe, expect, it, vi } from "vitest";

// resumeAbandonedIntake decides, for a signed-in number with no submitted case,
// whether it is a patient who passed OTP and stopped part-way (a claimant
// exists) or anyone else (no claimant: never started, or ambassador-only).

const services = vi.hoisted(() => {
  class PatientDashboardUnavailableError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return { PatientDashboardUnavailableError, getPatientIntakeResume: vi.fn() };
});
vi.mock("@/services/intake", () => ({
  getPatientIntakeResume: () => services.getPatientIntakeResume(),
  PatientDashboardUnavailableError: services.PatientDashboardUnavailableError,
}));

import { resumeAbandonedIntake } from "@/lib/intake-resume";
import { hasIntakeResumeDraftFor } from "@/lib/intake-session";

const PHONE = "+14075551234";

describe("resumeAbandonedIntake", () => {
  beforeEach(() => {
    sessionStorage.clear();
    services.getPatientIntakeResume.mockReset();
  });

  it("resumes a claimant with an open submission at the incident step, from the backend's answers", async () => {
    sessionStorage.setItem("intake_firstName", "Stale");
    services.getPatientIntakeResume.mockResolvedValue({
      patient: { firstName: " Rosa ", lastName: "Diaz", mobile: PHONE, email: "rosa@example.test" },
      submissionId: "sub-1",
    });

    expect(await resumeAbandonedIntake(sessionStorage, "es", { userId: "user-rosa", phone: "14075551234" })).toEqual({
      kind: "resume",
      path: "/es/intake/incident",
    });
    expect(sessionStorage.getItem("intake_firstName")).toBe("Rosa");
    expect(sessionStorage.getItem("intake_submissionId")).toBe("sub-1");
    expect(sessionStorage.getItem("intake_email")).toBe("rosa@example.test");
  });

  it("resumes a claimant with no open submission from the phone step", async () => {
    services.getPatientIntakeResume.mockResolvedValue({
      patient: { firstName: "Rosa", lastName: "Diaz", mobile: PHONE, email: null },
      submissionId: null,
    });

    expect(await resumeAbandonedIntake(sessionStorage, "en", { userId: "user-rosa", phone: PHONE })).toEqual({
      kind: "resume",
      path: "/en/intake/phone",
    });
  });

  it("is none for an account with no claimant, and writes nothing", async () => {
    services.getPatientIntakeResume.mockRejectedValue(
      new services.PatientDashboardUnavailableError("intake_incomplete")
    );

    expect(await resumeAbandonedIntake(sessionStorage, "en", { userId: "user-rosa", phone: PHONE })).toEqual({
      kind: "none",
    });
    expect(Object.keys(sessionStorage)).toHaveLength(0);
  });

  // Same number, a different account: the earlier one was deleted in the
  // dashboard, and its case id, marker and draft are still in the tab.
  it("gives a new account on a reused number none of the previous account's state", async () => {
    sessionStorage.setItem("intake_ownerUserId", "user-old");
    sessionStorage.setItem("intake_submissionId", "sub-old");
    sessionStorage.setItem("intake_submitted", "1");
    sessionStorage.setItem("intake_incidentType", "car");
    sessionStorage.setItem(
      "patient_intake_resume_draft",
      JSON.stringify({
        intake_ownerUserId: "user-old",
        intake_firstName: "Marisol",
        intake_phone: PHONE,
        intake_submissionId: "sub-old",
      })
    );
    services.getPatientIntakeResume.mockResolvedValue({
      patient: { firstName: "Bea", lastName: "Newcomer", mobile: PHONE, email: null },
      submissionId: null,
    });

    expect(await resumeAbandonedIntake(sessionStorage, "en", { userId: "user-new", phone: PHONE })).toEqual({
      kind: "resume",
      path: "/en/intake/phone",
    });
    expect(sessionStorage.getItem("intake_submissionId")).toBeNull();
    expect(sessionStorage.getItem("intake_submitted")).toBeNull();
    expect(sessionStorage.getItem("intake_incidentType")).toBeNull();
    expect(sessionStorage.getItem("intake_firstName")).toBe("Bea");
    expect(sessionStorage.getItem("intake_ownerUserId")).toBe("user-new");
    expect(sessionStorage.getItem("patient_intake_resume_draft")).toBeNull();
  });

  it("is failed when the backend cannot answer, and writes nothing", async () => {
    services.getPatientIntakeResume.mockRejectedValue(new Error("network"));

    expect(await resumeAbandonedIntake(sessionStorage, "en", { userId: "user-rosa", phone: PHONE })).toEqual({
      kind: "failed",
    });
    expect(Object.keys(sessionStorage)).toHaveLength(0);
  });
});

describe("hasIntakeResumeDraftFor", () => {
  beforeEach(() => sessionStorage.clear());

  it("is true only for a draft kept for the same phone, however it is written", () => {
    sessionStorage.setItem("patient_intake_resume_draft", JSON.stringify({ intake_phone: "+1 (407) 555-1234" }));
    expect(hasIntakeResumeDraftFor(sessionStorage, "4075551234")).toBe(true);
    expect(hasIntakeResumeDraftFor(sessionStorage, "+14075559999")).toBe(false);
  });

  it("is false with no draft, a draft without a phone, or an unreadable draft", () => {
    expect(hasIntakeResumeDraftFor(sessionStorage, PHONE)).toBe(false);
    sessionStorage.setItem("patient_intake_resume_draft", JSON.stringify({ intake_firstName: "Rosa" }));
    expect(hasIntakeResumeDraftFor(sessionStorage, PHONE)).toBe(false);
    sessionStorage.setItem("patient_intake_resume_draft", "{not json");
    expect(hasIntakeResumeDraftFor(sessionStorage, PHONE)).toBe(false);
  });
});
