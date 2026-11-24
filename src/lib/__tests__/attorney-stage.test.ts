import { describe, expect, it } from "vitest";
import { attorneyStage } from "@/lib/attorney-stage";

// The patient's attorney, by the exact case status the backend returns. The
// statuses are backend lib/case-status.ts's; anything else names no attorney.

const caseIn = (status: string, lawyerMatched = false) => ({
  submissionId: "s-stage",
  status,
  locale: "en",
  incidentType: "car_accident",
  incidentLocation: "San Jose, CA",
  providers: { lawyer: { matched: lawyerMatched }, doctor: { matched: false } },
});

describe("attorneyStage", () => {
  it("recommends the firm once the case is approved for the retainer", () => {
    expect(attorneyStage(caseIn("retainer_pending_signature"))).toBe("recommended");
  });

  it.each(["signed", "attorney", "qualified", "doctor"])("is connected at %s", (status) => {
    expect(attorneyStage(caseIn(status))).toBe("connected");
  });

  it.each(["submitted", "not_qualified", "in_progress", "intake", ""])("names no attorney at '%s'", (status) => {
    expect(attorneyStage(caseIn(status))).toBe("none");
  });

  it("never reads a lookalike status as signed or recommended", () => {
    for (const status of [
      "retainer_signed",
      "signed_pending",
      "unsigned",
      "pending_signature",
      "signature",
      "Signed ",
    ]) {
      const stage = attorneyStage(caseIn(status));
      // only the exact value counts; trimming and case are the one leniency
      expect(stage).toBe(status.trim().toLowerCase() === "signed" ? "connected" : "none");
    }
  });

  it("ignores a lawyer's acceptance: the status alone decides", () => {
    expect(attorneyStage(caseIn("submitted", true))).toBe("none");
    expect(attorneyStage(caseIn("retainer_pending_signature", true))).toBe("recommended");
  });

  it("names no attorney without a case", () => {
    expect(attorneyStage(undefined)).toBe("none");
    expect(attorneyStage(null)).toBe("none");
  });
});
