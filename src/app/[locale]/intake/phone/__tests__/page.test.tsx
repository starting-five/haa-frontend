import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en.json";

// The mobile-number screen. Continue stays disabled until a complete 10-digit
// US number is entered; the number is stored E.164 before moving on to the code
// screen. The address is optional (Figma 2079:3292), so a blank one still
// continues and nothing is stored for it.
//
// Continue is also the point the flow asks the backend whether this number
// already belongs to a patient. A number that does never reaches the code
// screen and nothing is stored for it.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/intake/phone",
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));
vi.mock("@/hooks/use-require-session-key", () => ({ useRequireSessionKey: () => {} }));

const getRegistrationStatus = vi.fn();
vi.mock("@/services/intake", () => ({
  getRegistrationStatus: (phone: string) => getRegistrationStatus(phone),
}));

// Since HP-62 the screen also sends the code itself, through Supabase phone
// auth, before it moves on. Without this the real client is constructed in jsdom
// and the send throws, so the screen never navigates.
const signInWithOtp = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithOtp: (...args: unknown[]) => signInWithOtp(...args),
      // the header this page renders watches auth state; these are its calls,
      // not the screen's, and nothing here asserts on them
      getSession: async () => ({ data: { session: null }, error: null }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}));

import IntakePhonePage from "../page";

const renderPage = () =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
    >
      <IntakePhonePage />
    </NextIntlClientProvider>
  );

const continueButton = () => screen.getByRole("button", { name: messages.Common.continue });
const signInButton = () => screen.queryByRole("button", { name: messages.IntakePhone.signIn });

const fillForm = () => {
  fireEvent.change(screen.getByPlaceholderText(messages.PhoneScreen.phoneLabel), {
    target: { value: "4075551234" },
  });
  fireEvent.change(screen.getByPlaceholderText(messages.PhoneScreen.emailLabelOptional), {
    target: { value: "jane@example.com" },
  });
};

describe("intake phone (mobile number)", () => {
  beforeEach(() => {
    push.mockReset();
    getRegistrationStatus.mockReset();
    signInWithOtp.mockReset();
    signInWithOtp.mockResolvedValue({ error: null });
    getRegistrationStatus.mockResolvedValue({ ok: true, status: "new" });
    sessionStorage.clear();
  });

  it("shows the heading and the verification-code subtitle from the design", () => {
    renderPage();
    expect(screen.getByText(messages.IntakePhone.heading)).toBeInTheDocument();
    expect(screen.getByText(messages.IntakePhone.subtext)).toBeInTheDocument();
  });

  it("keeps Continue disabled until a full number is entered", () => {
    renderPage();
    expect(continueButton()).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(messages.PhoneScreen.phoneLabel), {
      target: { value: "4075551234" },
    });
    // The address is optional (Figma 2079:3292), so the number on its own is enough.
    expect(continueButton()).toBeEnabled();

    fireEvent.change(screen.getByPlaceholderText(messages.PhoneScreen.emailLabelOptional), {
      target: { value: "jane@example.com" },
    });
    expect(continueButton()).toBeEnabled();
  });

  it("checks the number with the backend and moves a new patient on", async () => {
    renderPage();
    fillForm();
    fireEvent.click(continueButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/intake/otp"));
    // the code has to actually have been requested for the stored E.164 number,
    // or the code screen asks for digits nobody was ever sent
    expect(signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ phone: "+14075551234" }));
    // the E.164 number the flow stores, not what was typed
    expect(getRegistrationStatus).toHaveBeenCalledWith("+14075551234");
    expect(sessionStorage.getItem("intake_phone")).toBe("+14075551234");
    expect(sessionStorage.getItem("intake_email")).toBe("jane@example.com");
  });

  it("stops a registered number before the code screen and stores nothing", async () => {
    getRegistrationStatus.mockResolvedValue({ ok: true, status: "existing" });
    renderPage();
    fillForm();
    fireEvent.click(continueButton());

    expect(await screen.findByText(messages.IntakePhone.alreadyRegistered)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("intake_phone")).toBeNull();
    expect(sessionStorage.getItem("intake_email")).toBeNull();
  });

  it("sends a registered patient to the existing login screen", async () => {
    getRegistrationStatus.mockResolvedValue({ ok: true, status: "existing" });
    renderPage();
    fillForm();
    fireEvent.click(continueButton());

    await screen.findByText(messages.IntakePhone.alreadyRegistered);
    fireEvent.click(signInButton()!);

    expect(push).toHaveBeenCalledWith("/en/patient/login");
    // handed over so the login screen does not ask for it a second time
    expect(sessionStorage.getItem("patient_login_phone")).toBe("+14075551234");
  });

  it("holds the patient back when the check itself fails", async () => {
    getRegistrationStatus.mockResolvedValue({ ok: false, code: "registration_lookup_failed" });
    renderPage();
    fillForm();
    fireEvent.click(continueButton());

    expect(await screen.findByText(messages.IntakePhone.checkFailed)).toBeInTheDocument();
    // an outage is not an account, so no sign-in is offered
    expect(signInButton()).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("intake_phone")).toBeNull();
  });

  it("continues with no address and stores nothing for it", async () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(messages.PhoneScreen.phoneLabel), {
      target: { value: "4075551234" },
    });
    fireEvent.click(screen.getByRole("button", { name: messages.Common.continue }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/intake/otp"));
    expect(sessionStorage.getItem("intake_phone")).toBe("+14075551234");
    expect(sessionStorage.getItem("intake_email")).toBeNull();
  });

  it("removes an address that was entered earlier and then cleared", async () => {
    // "Change number" brings the patient back with what they typed before; an
    // address they have since removed must not travel with the submission.
    sessionStorage.setItem("intake_phone", "+14075551234");
    sessionStorage.setItem("intake_email", "stale@example.com");
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(messages.PhoneScreen.emailLabelOptional), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: messages.Common.continue }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/intake/otp"));
    expect(sessionStorage.getItem("intake_email")).toBeNull();
  });
});

describe("intake phone — code send failures", () => {
  beforeEach(() => {
    push.mockReset();
    getRegistrationStatus.mockReset();
    signInWithOtp.mockReset();
    sessionStorage.clear();
    getRegistrationStatus.mockResolvedValue({ ok: true, status: "new" });
  });

  it("keeps the patient here, and says why, when the provider cannot send", async () => {
    signInWithOtp.mockResolvedValue({ error: { code: "sms_send_failed", status: 422 } });

    renderPage();
    fillForm();
    fireEvent.click(continueButton());

    await waitFor(() => expect(screen.getByText(messages.IntakePhone.otpSmsUnavailable)).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
    // nothing is stored for a number that never received a code
    expect(sessionStorage.getItem("intake_phone")).toBeNull();
  });

  it("reports a rate limit as a rate limit, not as a generic retry", async () => {
    signInWithOtp.mockResolvedValue({ error: { code: "over_sms_send_rate_limit", status: 429 } });

    renderPage();
    fillForm();
    fireEvent.click(continueButton());

    await waitFor(() => expect(screen.getByText(messages.IntakePhone.otpRateLimited)).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });
});
