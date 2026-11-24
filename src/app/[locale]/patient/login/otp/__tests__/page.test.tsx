import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// After the patient-login code is verified: a registered patient goes to the
// dashboard; a patient who passed OTP and abandoned the intake goes back into
// it; an account with no claimant (never started, or ambassador-only) is signed
// out and told it is not registered, as before HP-74.

// one router for the page's whole life, as Next's useRouter is
const nav = vi.hoisted(() => {
  const push = vi.fn();
  const replace = vi.fn();
  return { push, replace, router: { push, replace, prefetch: vi.fn() } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  useParams: () => ({ locale: "en" }),
}));
// one translator for the page's whole life, as next-intl's is: a new one per
// render would re-run the page's mount effect
const translate = vi.hoisted(() => (key: string) => key);
vi.mock("next-intl", () => ({ useTranslations: () => translate }));

const services = vi.hoisted(() => {
  class PatientDashboardUnavailableError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    PatientDashboardUnavailableError,
    getRegistrationStatus: vi.fn(),
    getPatientDashboard: vi.fn(),
    getPatientIntakeResume: vi.fn(),
  };
});
vi.mock("@/services/intake", () => ({
  getRegistrationStatus: (phone: string) => services.getRegistrationStatus(phone),
  getPatientDashboard: () => services.getPatientDashboard(),
  getPatientIntakeResume: () => services.getPatientIntakeResume(),
  PatientDashboardUnavailableError: services.PatientDashboardUnavailableError,
}));

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
  signInWithOtp: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth }) }));

vi.mock("@/components/otp/otp-screen", () => ({
  OtpScreen: ({ onVerify, error }: { onVerify: (code: string) => Promise<void>; error?: string }) => (
    <div>
      <button onClick={() => void onVerify("111111")}>verify</button>
      <div data-testid="error">{error ?? ""}</div>
    </div>
  ),
}));

import PatientLoginOtpPage from "../page";

const PHONE = "+14075551234";
const SUBMISSION = "0b0e6f8e-7c1a-4f63-9a52-2f7b8d3c1e10";

describe("patient login code, once verified", () => {
  beforeEach(() => {
    nav.push.mockReset();
    nav.replace.mockReset();
    services.getRegistrationStatus.mockReset();
    services.getPatientDashboard.mockReset();
    services.getPatientIntakeResume.mockReset();
    auth.getSession.mockReset().mockResolvedValue({ data: { session: null } });
    auth.verifyOtp.mockReset().mockResolvedValue({
      data: { session: { user: { id: "u1", phone: "14075551234", email: "", user_metadata: {} } } },
      error: null,
    });
    auth.signOut.mockReset().mockResolvedValue({ error: null });
    sessionStorage.clear();
    sessionStorage.setItem("patient_login_phone", PHONE);
  });

  const verify = async () => {
    render(<PatientLoginOtpPage />);
    fireEvent.click(await screen.findByText("verify"));
  };

  it("takes a registered patient to the dashboard", async () => {
    services.getRegistrationStatus.mockResolvedValue({ ok: true, status: "existing" });
    services.getPatientDashboard.mockResolvedValue({ patient: null, cases: [] });
    await verify();

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/intake/dashboard"));
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(services.getPatientIntakeResume).not.toHaveBeenCalled();
  });

  // An account deleted in the dashboard left its case id and submitted marker in
  // this tab; the number now signs in as a different account. None of it stays.
  it("drops another account's case id and submitted marker when a different account signs in", async () => {
    sessionStorage.setItem("intake_ownerUserId", "user-old");
    sessionStorage.setItem("intake_submissionId", "sub-old");
    sessionStorage.setItem("intake_submitted", "1");
    sessionStorage.setItem("intake_firstName", "Marisol");
    services.getRegistrationStatus.mockResolvedValue({ ok: true, status: "existing" });
    services.getPatientDashboard.mockResolvedValue({ patient: null, cases: [] });
    await verify();

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/intake/dashboard"));
    expect(sessionStorage.getItem("intake_submissionId")).toBeNull();
    expect(sessionStorage.getItem("intake_submitted")).toBeNull();
    expect(sessionStorage.getItem("intake_firstName")).toBeNull();
    expect(sessionStorage.getItem("intake_ownerUserId")).toBe("u1");
  });

  it("puts a patient who abandoned the intake back into it, without signing them out", async () => {
    services.getRegistrationStatus.mockResolvedValue({ ok: true, status: "new" });
    services.getPatientIntakeResume.mockResolvedValue({
      patient: { firstName: "Rosa", lastName: "Diaz", mobile: PHONE, email: null },
      submissionId: SUBMISSION,
    });
    await verify();

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/intake/incident"));
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("intake_submissionId")).toBe(SUBMISSION);
    expect(sessionStorage.getItem("patient_login_phone")).toBeNull();
  });

  it("signs out an account with no claimant (ambassador-only or never started) and says not registered", async () => {
    services.getRegistrationStatus.mockResolvedValue({ ok: true, status: "new" });
    services.getPatientIntakeResume.mockRejectedValue(
      new services.PatientDashboardUnavailableError("intake_incomplete")
    );
    await verify();

    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("notRegistered"));
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("signs out and says the check failed when registration cannot be checked", async () => {
    services.getRegistrationStatus.mockResolvedValue({ ok: false });
    await verify();

    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("registrationCheckFailed"));
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(services.getPatientIntakeResume).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("signs out and says the check failed when the resume lookup fails", async () => {
    services.getRegistrationStatus.mockResolvedValue({ ok: true, status: "new" });
    services.getPatientIntakeResume.mockRejectedValue(new Error("Intake resume request failed with status 500"));
    await verify();

    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("registrationCheckFailed"));
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

describe("patient login code page, already signed in", () => {
  beforeEach(() => {
    nav.replace.mockReset();
    services.getRegistrationStatus.mockReset();
    services.getPatientIntakeResume.mockReset();
    auth.signOut.mockReset().mockResolvedValue({ error: null });
    auth.getSession.mockReset().mockResolvedValue({
      data: { session: { user: { phone: "14075551234", email: "", user_metadata: {} } } },
    });
    sessionStorage.clear();
  });

  it("resumes an abandoned intake", async () => {
    services.getRegistrationStatus.mockResolvedValue({ ok: true, status: "new" });
    services.getPatientIntakeResume.mockResolvedValue({
      patient: { firstName: "Rosa", lastName: "Diaz", mobile: PHONE, email: null },
      submissionId: SUBMISSION,
    });
    render(<PatientLoginOtpPage />);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/intake/incident"));
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(services.getRegistrationStatus).toHaveBeenCalledWith(PHONE);
  });

  it("signs out an ambassador-only account rather than sending it into the intake", async () => {
    services.getRegistrationStatus.mockResolvedValue({ ok: true, status: "new" });
    services.getPatientIntakeResume.mockRejectedValue(
      new services.PatientDashboardUnavailableError("intake_incomplete")
    );
    render(<PatientLoginOtpPage />);

    await waitFor(() => expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" }));
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
