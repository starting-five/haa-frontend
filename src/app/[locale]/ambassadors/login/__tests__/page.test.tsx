import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const auth = {
  getSession: vi.fn(),
  signInWithOtp: vi.fn(),
  signOut: vi.fn(),
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth }),
}));

vi.mock("@/components/phone/phone-screen", () => ({
  PhoneScreen: ({ onContinue, error }: { onContinue: (phone: string) => Promise<unknown>; error?: string }) => (
    <div>
      <button onClick={() => void onContinue("+14075551234")}>continue</button>
      <div data-testid="error">{error ?? ""}</div>
    </div>
  ),
}));

import AmbassadorsLoginPage from "../page";

describe("ambassadors login role gating", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    auth.getSession.mockReset();
    auth.signInWithOtp.mockReset();
    auth.signOut.mockReset();
    vi.unstubAllGlobals();
    sessionStorage.clear();

    auth.getSession.mockResolvedValue({ data: { session: null } });
    auth.signInWithOtp.mockResolvedValue({ error: null });
    auth.signOut.mockResolvedValue({ error: null });
  });

  it("blocks OTP send when number is not registered as ambassador", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ json: async () => ({ available: true, reason: "available" }) }) as Response)
    );

    render(<AmbassadorsLoginPage />);
    fireEvent.click(await screen.findByText("continue"));

    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("notRegistered"));
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("sends OTP and proceeds when number is registered as ambassador", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ json: async () => ({ available: false, reason: "taken" }) }) as Response)
    );

    render(<AmbassadorsLoginPage />);
    fireEvent.click(await screen.findByText("continue"));

    await waitFor(() => expect(auth.signInWithOtp).toHaveBeenCalledWith({ phone: "+14075551234" }));
    expect(push).toHaveBeenCalledWith("/en/ambassadors/login/otp");
  });

  it("redirects active ambassador session to dashboard", async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { phone: "+14075551234" } } } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ json: async () => ({ available: false, reason: "taken" }) }) as Response)
    );

    render(<AmbassadorsLoginPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/ambassadors/dashboard"));
  });
});
