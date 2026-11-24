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
  verifyOtp: vi.fn(),
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth }),
}));

vi.mock("@/components/otp/otp-screen", () => ({
  OtpScreen: ({ onVerify, error }: { onVerify: (code: string) => Promise<void>; error?: string }) => (
    <div>
      <button onClick={() => void onVerify("111111")}>verify</button>
      <div data-testid="error">{error ?? ""}</div>
    </div>
  ),
}));

import AmbassadorsLoginOtpPage from "../page";

describe("ambassadors login otp role gating", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    auth.getSession.mockReset();
    auth.signInWithOtp.mockReset();
    auth.signOut.mockReset();
    auth.verifyOtp.mockReset();
    vi.unstubAllGlobals();
    sessionStorage.clear();

    sessionStorage.setItem("ambassadors_login_phone", "+14075551234");
    auth.getSession.mockResolvedValue({ data: { session: null } });
    auth.verifyOtp.mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null });
    auth.signOut.mockResolvedValue({ error: null });
  });

  it("rejects OTP login when number is not ambassador-registered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ json: async () => ({ available: true, reason: "available" }) }) as Response)
    );

    render(<AmbassadorsLoginOtpPage />);
    fireEvent.click(await screen.findByText("verify"));

    await waitFor(() => expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" }));
    expect(screen.getByTestId("error").textContent).toBe("notRegistered");
    expect(replace).not.toHaveBeenCalledWith("/en/ambassadors/dashboard");
  });

  it("accepts OTP login when number is ambassador-registered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ json: async () => ({ available: false, reason: "taken" }) }) as Response)
    );

    render(<AmbassadorsLoginOtpPage />);
    fireEvent.click(await screen.findByText("verify"));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/ambassadors/dashboard"));
  });
});
