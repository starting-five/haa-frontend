import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";

// Patient login lets in a number with a submitted case. A number without one is
// told it is not registered and offered the intake — unless it belongs to a
// patient who already passed OTP and stopped part-way, who is put back into
// their intake instead (HP-74). That is decided from the backend's
// /patient/intake-resume once a session exists, and before one exists only for
// a number whose abandoned intake this tab kept at sign-out. Ambassador-only
// accounts and numbers that never started an intake are never sent into it.

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/patient/login",
  useRouter: () => ({ push: nav.push, replace: nav.replace, prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));

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
  session: null as null | { user: { phone: string; email?: string; user_metadata?: Record<string, unknown> } },
  signInWithOtp: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithOtp: (...args: unknown[]) => auth.signInWithOtp(...args),
      getSession: async () => ({ data: { session: auth.session }, error: null }),
      signOut: (...args: unknown[]) => auth.signOut(...args),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}));

import PatientLoginPage from "../page";

const PHONE = "+14075551234";
const renderPage = (messages: typeof en | typeof es = en, locale = "en") =>
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
    >
      <PatientLoginPage />
    </NextIntlClientProvider>
  );

const enterNumber = async (messages: typeof en | typeof es = en) => {
  fireEvent.change(await screen.findByPlaceholderText(messages.PhoneScreen.phoneLabel), {
    target: { value: "4075551234" },
  });
  fireEvent.click(screen.getByRole("button", { name: messages.Common.continue }));
};

const abandonedIntake = {
  patient: { firstName: "Rosa", lastName: "Diaz", mobile: PHONE, email: null },
  submissionId: "0b0e6f8e-7c1a-4f63-9a52-2f7b8d3c1e10",
};

describe("patient login, before a session exists", () => {
  beforeEach(() => {
    nav.push.mockReset();
    nav.replace.mockReset();
    services.getRegistrationStatus.mockReset();
    services.getPatientDashboard.mockReset();
    services.getPatientIntakeResume.mockReset();
    auth.session = null;
    auth.signInWithOtp.mockReset().mockResolvedValue({ error: null });
    auth.signOut.mockReset().mockResolvedValue({ error: null });
    sessionStorage.clear();
  });

  it("sends a registered patient their code, with no detour offered", async () => {
    services.getRegistrationStatus.mockResolvedValue({ ok: true, status: "existing" });
    renderPage();
    await enterNumber();

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/patient/login/otp"));
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ phone: PHONE });
    expect(screen.queryByRole("button", { name: en.PatientLogin.startIntake })).toBeNull();
  });

  it("tells an unregistered number it is not registered, sends no code, and offers the intake", async () => {
    services.getRegistrationStatus.mockResolvedValue({ ok: true, status: "new" });
    renderPage();
    await enterNumber();

    expect(await screen.findByText(en.PatientLogin.notRegistered)).toBeInTheDocument();
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: en.PatientLogin.startIntake }));
    expect(nav.push).toHaveBeenCalledWith("/en/intake");
  });

  it("offers the same way on in Spanish", async () => {
    services.getRegistrationStatus.mockResolvedValue({ ok: true, status: "new" });
    renderPage(es, "es");
    await enterNumber(es);

    expect(await screen.findByRole("button", { name: es.PatientLogin.startIntake })).toBeInTheDocument();
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("says the check failed, and sends no code, when registration cannot be checked", async () => {
    services.getRegistrationStatus.mockResolvedValue({ ok: false });
    renderPage();
    await enterNumber();

    expect(await screen.findByText(en.PatientLogin.registrationCheckFailed)).toBeInTheDocument();
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("sends a code to an unregistered number only when this tab kept its abandoned intake", async () => {
    services.getRegistrationStatus.mockResolvedValue({ ok: true, status: "new" });
    sessionStorage.setItem(
      "patient_intake_resume_draft",
      JSON.stringify({
        intake_phone: PHONE,
        intake_firstName: "Rosa",
        intake_submissionId: abandonedIntake.submissionId,
      })
    );
    renderPage();
    await enterNumber();

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/patient/login/otp"));
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ phone: PHONE });
    expect(screen.queryByText(en.PatientLogin.notRegistered)).toBeNull();
  });

  it("does not let a draft kept for a different phone open the door", async () => {
    services.getRegistrationStatus.mockResolvedValue({ ok: true, status: "new" });
    sessionStorage.setItem("patient_intake_resume_draft", JSON.stringify({ intake_phone: "+14075559999" }));
    renderPage();
    await enterNumber();

    expect(await screen.findByText(en.PatientLogin.notRegistered)).toBeInTheDocument();
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("starts from the number the intake's Sign In handed over", async () => {
    sessionStorage.setItem("patient_login_phone", PHONE);
    renderPage();

    expect(await screen.findByPlaceholderText(en.PhoneScreen.phoneLabel)).toHaveValue("(407) 555-1234");
  });
});

describe("patient login, already signed in", () => {
  beforeEach(() => {
    nav.push.mockReset();
    nav.replace.mockReset();
    services.getRegistrationStatus.mockReset();
    services.getPatientDashboard.mockReset();
    services.getPatientIntakeResume.mockReset();
    auth.session = { user: { phone: "14075551234", email: "", user_metadata: {} } };
    auth.signInWithOtp.mockReset().mockResolvedValue({ error: null });
    auth.signOut.mockReset().mockResolvedValue({ error: null });
    sessionStorage.clear();
  });

  it("takes a registered patient to the dashboard", async () => {
    services.getRegistrationStatus.mockResolvedValue({ ok: true, status: "existing" });
    services.getPatientDashboard.mockResolvedValue({ patient: null, cases: [] });
    renderPage();

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/intake/dashboard"));
    // Supabase gives the session phone without its "+"; the check is asked in E.164
    expect(services.getRegistrationStatus).toHaveBeenCalledWith(PHONE);
    expect(services.getPatientIntakeResume).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("puts a patient who passed OTP and abandoned the intake back into it, signed in", async () => {
    services.getRegistrationStatus.mockResolvedValue({ ok: true, status: "new" });
    services.getPatientIntakeResume.mockResolvedValue(abandonedIntake);
    renderPage();

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/intake/incident"));
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("intake_submissionId")).toBe(abandonedIntake.submissionId);
    expect(sessionStorage.getItem("intake_firstName")).toBe("Rosa");
    expect(sessionStorage.getItem("intake_phone")).toBe(PHONE);
  });

  it("does not send an ambassador-only account into the intake: signed out, not registered", async () => {
    services.getRegistrationStatus.mockResolvedValue({ ok: true, status: "new" });
    services.getPatientIntakeResume.mockRejectedValue(
      new services.PatientDashboardUnavailableError("intake_incomplete")
    );
    renderPage();

    expect(await screen.findByText(en.PatientLogin.notRegistered)).toBeInTheDocument();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(nav.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: en.PatientLogin.startIntake })).toBeInTheDocument();
    expect(sessionStorage.getItem("intake_submissionId")).toBeNull();
  });

  it("keeps the session and says the check failed when the backend cannot answer", async () => {
    services.getRegistrationStatus.mockResolvedValue({ ok: true, status: "new" });
    services.getPatientIntakeResume.mockRejectedValue(new Error("Intake resume request failed with status 500"));
    renderPage();

    expect(await screen.findByText(en.PatientLogin.registrationCheckFailed)).toBeInTheDocument();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
