import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { SPLASH_DURATION_MS } from "@/lib/constants";

// "Thank you for trusting us" (Figma 3100-5083) is the interstitial between the
// connected screen and the dashboard. It is gated like connected, and when its
// shared delay elapses it replaces itself with the dashboard — not connected.

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

let confirmed = false;
vi.mock("@/hooks/use-require-completed-agreement", () => ({
  useRequireCompletedAgreement: () => confirmed,
}));

import IntakeThanksPage from "../page";

describe("thanks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replace.mockReset();
    confirmed = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows nothing and never advances until the agreement is confirmed", () => {
    render(<IntakeThanksPage />);

    expect(screen.queryByRole("heading")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(SPLASH_DURATION_MS * 2);
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it("advances to the dashboard once the confirmed interstitial has shown", () => {
    confirmed = true;
    render(<IntakeThanksPage />);

    expect(screen.getByRole("heading", { name: "heading" })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(SPLASH_DURATION_MS);
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/en/intake/dashboard");
  });
});
