import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { SPLASH_DURATION_MS } from "@/lib/constants";

// "We've got it from here" sits between the DocuSign return and the connected
// screen. It must only ever appear over a backend-confirmed agreement, and it
// must hand over to connected — not the dashboard — when its delay elapses.

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

import IntakeThankYouPage from "../page";

describe("thank-you", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replace.mockReset();
    confirmed = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows nothing and never advances until the agreement is confirmed", () => {
    render(<IntakeThankYouPage />);

    expect(screen.queryByRole("heading")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(SPLASH_DURATION_MS * 2);
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it("moves on to connected once the confirmed screen has been shown", () => {
    confirmed = true;
    render(<IntakeThankYouPage />);

    expect(screen.getByRole("heading", { name: "heading" })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(SPLASH_DURATION_MS);
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/en/intake/connected");
  });
});
