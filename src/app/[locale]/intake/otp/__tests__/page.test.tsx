import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Verification happens before the patient has said anything about the crash, so
// this screen opens the case with the claimant alone and hands off to the
// accident screens. The accident rides on the call the location screen makes;
// see intake/location/__tests__/page.test.tsx.
//
// The assertion that no accident is sent is the point of this file. It was
// once inverted to accept placeholders — incidentType "other", location
// "Unknown", incidentDate today — which made every verified patient carry a
// fabricated crash record that nothing downstream could tell from an answer.

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/hooks/use-require-session-key", () => ({ useRequireSessionKey: () => {} }));
vi.mock("@/hooks/use-preload-images", () => ({ usePreloadImages: () => {} }));

const supabaseVerifyOtp = vi.fn();
const startIntake = vi.fn();
vi.mock("@/services/intake", () => ({
  startIntake: (...a: unknown[]) => startIntake(...a),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      verifyOtp: (...a: unknown[]) => supabaseVerifyOtp(...a),
      signInWithOtp: vi.fn(),
    },
  }),
}));

// Stub OtpScreen so a single click stands in for entering a valid code.
vi.mock("@/components/otp/otp-screen", () => ({
  OtpScreen: ({
    onVerify,
    onChangePhone,
    error,
    status,
    expiresAt,
  }: {
    onVerify: (code: string) => void;
    onChangePhone?: () => void;
    error?: string;
    status?: string;
    expiresAt?: number | null;
  }) => (
    <div>
      <button onClick={() => onVerify("111111")}>verify</button>
      <button onClick={() => onChangePhone?.()}>change</button>
      <span data-testid="error">{error ?? ""}</span>
      <span data-testid="status">{status ?? ""}</span>
      <span data-testid="expires">{expiresAt === null || expiresAt === undefined ? "none" : "set"}</span>
    </div>
  ),
}));

import { OTP_SESSION_KEYS, readOtpSession, startOtpSession } from "@/lib/otp-session";

import IntakeOtpPage from "../page";

describe("intake otp — opening the case at verification", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    supabaseVerifyOtp.mockReset();
    startIntake.mockReset();
    sessionStorage.clear();
    sessionStorage.setItem("intake_phone", "+14075551234");
    sessionStorage.setItem("intake_firstName", "Reva");
    sessionStorage.setItem("intake_lastName", "Lin");
  });

  const verify = () => {
    supabaseVerifyOtp.mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null });
    render(<IntakeOtpPage />);
    fireEvent.click(screen.getByRole("button", { name: "verify" }));
  };

  it("opens the case with the claimant alone — there is no accident to send yet", async () => {
    startIntake.mockResolvedValue({ existing: false, submissionId: "sub-1" });
    verify();

    await waitFor(() => expect(startIntake).toHaveBeenCalledTimes(1));
    const payload = startIntake.mock.calls[0][0] as { claimant: { firstName: string }; accident?: unknown };
    expect(payload.claimant.firstName).toBe("Reva");
    // The accident screens come after this one. Sending anything here would
    // write a crash record the patient never gave.
    expect(payload.accident).toBeUndefined();
  });

  it("invents no incident type, location or date, even when the session holds none", async () => {
    startIntake.mockResolvedValue({ existing: false, submissionId: "sub-1" });
    verify();

    await waitFor(() => expect(startIntake).toHaveBeenCalledTimes(1));
    const sent = JSON.stringify(startIntake.mock.calls[0][0]);
    expect(sent).not.toContain("Unknown");
    expect(sent).not.toContain("other");
    expect(sent).not.toContain(new Date().toISOString().slice(0, 10));
  });

  it("records the submission and hands off to the Verified interstitial", async () => {
    startIntake.mockResolvedValue({ existing: false, submissionId: "sub-1" });
    verify();

    // Figma 4817:19579 sits between the code and the first accident question;
    // this screen stops at it rather than jumping the patient to /incident.
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/intake/verified"));
    expect(replace).not.toHaveBeenCalledWith("/en/intake/incident");
    expect(sessionStorage.getItem("intake_submissionId")).toBe("sub-1");
  });

  // The number was verified before as an account since deleted; this tab still
  // carries that account's case id and submitted marker. They are dropped before
  // the case is opened, the name this patient typed is what is sent, and the tab
  // is stamped as the new account's.
  it("opens the case for the new account with none of a previous account's state", async () => {
    sessionStorage.setItem("intake_ownerUserId", "user-old");
    sessionStorage.setItem("intake_submissionId", "sub-old");
    sessionStorage.setItem("intake_submitted", "1");
    startIntake.mockResolvedValue({ existing: false, submissionId: "sub-new" });
    verify();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/intake/verified"));
    expect((startIntake.mock.calls[0][0] as { claimant: { firstName: string } }).claimant.firstName).toBe("Reva");
    expect(sessionStorage.getItem("intake_submissionId")).toBe("sub-new");
    expect(sessionStorage.getItem("intake_submitted")).toBeNull();
    expect(sessionStorage.getItem("intake_ownerUserId")).toBe("u1");
  });

  // Attorney matching needs a case id this tab does not have, so it could only
  // bounce a returning patient round to the phone screen; their case is on the
  // dashboard, where patient login takes them too.
  it("sends a patient we already hold to their dashboard", async () => {
    startIntake.mockResolvedValue({ existing: true });
    verify();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/intake/dashboard"));
    expect(replace).not.toHaveBeenCalledWith("/en/intake/choose-attorney");
    expect(sessionStorage.getItem("intake_submissionId")).toBeNull();
  });

  it("keeps the patient on the code screen when the case cannot be opened", async () => {
    startIntake.mockRejectedValue(new Error("Request failed with status 500"));
    verify();

    await waitFor(() => expect(screen.getByTestId("error").textContent).not.toBe(""));
    expect(replace).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("intake_submissionId")).toBeNull();
  });

  it("a refused code shows the error and never reaches the Verified screen", async () => {
    supabaseVerifyOtp.mockResolvedValue({
      data: { session: null },
      error: { message: "Token has expired or is invalid" },
    });
    render(<IntakeOtpPage />);
    fireEvent.click(screen.getByRole("button", { name: "verify" }));

    await waitFor(() => expect(screen.getByTestId("error").textContent).not.toBe(""));
    expect(startIntake).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("intake_submissionId")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// A different number is a different verification session. The error and the
// window that belonged to the old number must not follow the patient onto the
// new one — this is the bug reported from manual testing.
// ---------------------------------------------------------------------------
describe("intake otp — session isolation across a number change", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    supabaseVerifyOtp.mockReset();
    startIntake.mockReset();
    sessionStorage.clear();
  });

  const renderPage = () => render(<IntakeOtpPage />);

  it("abandons the old number's window when the patient goes to change it", async () => {
    sessionStorage.setItem("intake_phone", "+14075551234");
    startOtpSession(OTP_SESSION_KEYS.intake, "+14075551234", Date.now());
    expect(readOtpSession(OTP_SESSION_KEYS.intake, "+14075551234")).not.toBeNull();

    renderPage();
    fireEvent.click(screen.getByText("change"));

    // the window belonged to the number being left behind
    expect(readOtpSession(OTP_SESSION_KEYS.intake, "+14075551234")).toBeNull();
    expect(push).toHaveBeenCalledWith("/en/intake/phone");
  });

  it("shows no error, and adopts no window, when arriving on a new number", async () => {
    // a window recorded for a number the patient has since abandoned
    startOtpSession(OTP_SESSION_KEYS.intake, "+14075551234", Date.now());
    sessionStorage.setItem("intake_phone", "+14075559999");

    renderPage();

    await waitFor(() => expect(screen.getByTestId("expires")).toHaveTextContent("none"));
    expect(screen.getByTestId("error")).toHaveTextContent("");
    expect(screen.getByTestId("status")).toHaveTextContent("idle");
  });

  it("adopts the window that does belong to the number on screen", async () => {
    sessionStorage.setItem("intake_phone", "+14075551234");
    startOtpSession(OTP_SESSION_KEYS.intake, "+14075551234", Date.now());

    renderPage();

    await waitFor(() => expect(screen.getByTestId("expires")).toHaveTextContent("set"));
  });

  it("surfaces an incorrect-code message while the window is still open", async () => {
    sessionStorage.setItem("intake_phone", "+14075551234");
    startOtpSession(OTP_SESSION_KEYS.intake, "+14075551234", Date.now());
    supabaseVerifyOtp.mockResolvedValue({ data: { session: null }, error: { code: "otp_expired", status: 403 } });

    renderPage();
    await waitFor(() => expect(screen.getByTestId("expires")).toHaveTextContent("set"));
    fireEvent.click(screen.getByText("verify"));

    // inside the window Supabase's ambiguous refusal means the digits were wrong
    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("incorrectCode"));
    expect(screen.getByTestId("status")).toHaveTextContent("idle");
  });

  it("says expired once the window has demonstrably closed", async () => {
    sessionStorage.setItem("intake_phone", "+14075551234");
    startOtpSession(OTP_SESSION_KEYS.intake, "+14075551234", Date.now() - 11 * 60 * 1000);
    supabaseVerifyOtp.mockResolvedValue({ data: { session: null }, error: { code: "otp_expired", status: 403 } });

    renderPage();
    await waitFor(() => expect(screen.getByTestId("expires")).toHaveTextContent("set"));
    fireEvent.click(screen.getByText("verify"));

    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("expiredCode"));
  });

  it("stays neutral when there is no recorded send to reason from", async () => {
    sessionStorage.setItem("intake_phone", "+14075551234");
    supabaseVerifyOtp.mockResolvedValue({ data: { session: null }, error: { code: "otp_expired", status: 403 } });

    renderPage();
    fireEvent.click(screen.getByText("verify"));

    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("invalidOrExpiredCode"));
  });
});
