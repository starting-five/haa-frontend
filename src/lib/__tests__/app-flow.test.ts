import { describe, expect, it } from "vitest";
import { appFlowForPath } from "../app-flow";

// The route is the flow. One account can be a patient and an ambassador, so the
// flow is read from where the person is, never from what the account holds.
describe("appFlowForPath", () => {
  it("reads the ambassador's app as the ambassador flow", () => {
    for (const path of [
      "/en/ambassadors",
      "/es/ambassadors/login",
      "/en/ambassadors/login/otp",
      "/en/ambassadors/dashboard",
      "/en/ambassadors/onboarding/share-it",
    ]) {
      expect(appFlowForPath(path)).toBe("ambassador");
    }
  });

  it("reads the patient landing, get-help, intake, patient and case as the patient flow", () => {
    for (const path of [
      "/en",
      "/es/",
      "/en/get-help",
      "/en/intake",
      "/en/intake/otp",
      "/en/intake/dashboard",
      "/en/intake/dashboard/attorney",
      "/es/patient/login",
      "/en/patient/login/otp",
      "/en/case/9b2e7c41-5d6a-4f38-8e1b-2c7d9a0f3e55",
    ]) {
      expect(appFlowForPath(path)).toBe("patient");
    }
  });

  it("gives every other route no flow", () => {
    for (const path of [
      "/",
      "/access",
      "/en/review/x",
      "/en/lawyers/review/x",
      "/en/auth/login",
      "/en/onboarding/lawyer",
      "/fr/intake",
      "/api/review/retainer",
    ]) {
      expect(appFlowForPath(path)).toBeNull();
    }
  });

  it("is not fooled by a path that only starts like a flow", () => {
    expect(appFlowForPath("/en/ambassadorsx")).toBeNull();
    expect(appFlowForPath("/en/intake-fake")).toBeNull();
    expect(appFlowForPath("/en/patients")).toBeNull();
  });
});
