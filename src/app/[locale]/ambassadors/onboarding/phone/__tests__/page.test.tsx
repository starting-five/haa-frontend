import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// The Brand Ambassador phone screen used to answer every failure — a dead
// proxy, a rate limit, a project with no SMS provider — with one sentence:
// "We couldn't send the code right now. Please try again." On the personal test
// project that sentence was the only symptom of a Twilio credential gap, and it
// told the user to retry something that could never succeed. These tests pin
// each cause to its own message.

const state = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  lastResult: undefined as unknown,
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/hooks/use-require-session-key", () => ({ useRequireSessionKey: () => {} }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithOtp: state.signInWithOtp } }),
}));

// Stub PhoneScreen so one click stands in for a complete, valid entry, and both
// error channels — the footer string and the returned field error — are visible.
vi.mock("@/components/phone/phone-screen", () => ({
  PhoneScreen: ({
    onContinue,
    error,
  }: {
    onContinue: (phone: string, email: string) => Promise<{ phoneError?: string; emailError?: string } | void>;
    error?: string;
  }) => (
    <div>
      <button
        onClick={async () => {
          state.lastResult = await onContinue("+17848139721", "ambassador@example.com");
        }}
      >
        continue
      </button>
      <span data-testid="footer-error">{error ?? ""}</span>
    </div>
  ),
}));

import AmbassadorOnboardingPhonePage from "../page";

const available = { available: true, reason: "available" };

/** Answer both availability round trips (phone, then email). */
const mockAvailability = (...bodies: unknown[]) => {
  const fetchMock = vi.fn();
  bodies.forEach((body) => fetchMock.mockResolvedValueOnce({ json: async () => body } as unknown as Response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const clickContinue = async () => {
  render(<AmbassadorOnboardingPhonePage />);
  fireEvent.click(screen.getByText("continue"));
};

const footerError = () => screen.getByTestId("footer-error").textContent;

describe("ambassador phone screen — OTP send failures are distinguishable", () => {
  beforeEach(() => {
    push.mockReset();
    state.signInWithOtp.mockReset();
    state.lastResult = undefined;
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("names the missing SMS provider instead of telling the user to try again", async () => {
    mockAvailability(available, available);
    // The real response from a Supabase project whose phone provider has no
    // Twilio credentials.
    state.signInWithOtp.mockResolvedValue({
      error: { status: 500, code: "unexpected_failure", message: "Unable to get SMS provider" },
    });

    await clickContinue();

    await waitFor(() => expect(footerError()).toBe("otpSmsUnavailable"));
    expect(footerError()).not.toBe("otpSendFailed");
    expect(push).not.toHaveBeenCalled();
  });

  it("names a rate limit, because retrying immediately cannot work", async () => {
    mockAvailability(available, available);
    state.signInWithOtp.mockResolvedValue({ error: { status: 429, code: "over_sms_send_rate_limit" } });

    await clickContinue();

    await waitFor(() => expect(footerError()).toBe("otpRateLimited"));
  });

  it("puts a rejected number against the phone field, not the footer", async () => {
    mockAvailability(available, available);
    state.signInWithOtp.mockResolvedValue({ error: { status: 422, code: "validation_failed" } });

    await clickContinue();

    await waitFor(() => expect(state.lastResult).toEqual({ phoneError: "phoneInvalid" }));
    expect(footerError()).toBe("");
  });

  it("keeps the generic message for a cause it cannot identify", async () => {
    mockAvailability(available, available);
    state.signInWithOtp.mockResolvedValue({ error: { status: 400 } });

    await clickContinue();

    await waitFor(() => expect(footerError()).toBe("otpSendFailed"));
  });

  it("says the lookup failed when the availability call never returns an answer", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await clickContinue();

    await waitFor(() => expect(footerError()).toBe("availabilityCheckFailed"));
    // Nothing was sent, so it must not be reported as a send failure.
    expect(state.signInWithOtp).not.toHaveBeenCalled();
  });

  it("still reports a taken number against the phone field", async () => {
    mockAvailability({ available: false, reason: "taken" });

    await clickContinue();

    await waitFor(() => expect(state.lastResult).toEqual({ phoneError: "phoneTaken" }));
    expect(state.signInWithOtp).not.toHaveBeenCalled();
  });

  it("does not claim the code failed to send when only storage failed", async () => {
    mockAvailability(available, available);
    state.signInWithOtp.mockResolvedValue({ error: null });
    vi.spyOn(Object.getPrototypeOf(window.sessionStorage), "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });

    await clickContinue();

    await waitFor(() => expect(footerError()).toBe("sessionUnavailable"));
    expect(footerError()).not.toBe("otpSendFailed");
    expect(push).not.toHaveBeenCalled();
  });

  it("stores the answers and moves on when the code is sent", async () => {
    mockAvailability(available, available);
    state.signInWithOtp.mockResolvedValue({ error: null });

    await clickContinue();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/ambassadors/onboarding/otp"));
    expect(sessionStorage.getItem("onboarding_ambassador_phone")).toBe("+17848139721");
    expect(sessionStorage.getItem("onboarding_ambassador_email")).toBe("ambassador@example.com");
    expect(footerError()).toBe("");
  });
});
