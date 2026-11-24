import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SPLASH_DURATION_MS } from "@/lib/constants";
import messages from "../../../../../../messages/en.json";

// "We've got it." (Figma 2954:4956) is the post-submit transition. It renders
// the shared IntakeTransition — the bouncing brand mark, not a character — and
// hands off to Dashboard exactly once, after the shared delay.

const replace = vi.fn();
const prefetch = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch }),
  useParams: () => ({ locale: "en" }),
}));

import IntakeReadyPage from "../page";

const renderPage = () =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
    >
      <IntakeReadyPage />
    </NextIntlClientProvider>
  );

describe("ready (post-submit transition)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replace.mockReset();
    prefetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the copy and prefetches Dashboard", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: messages.IntakeReady.heading })).toBeInTheDocument();
    expect(screen.getByText(messages.IntakeReady.subtext)).toBeInTheDocument();
    expect(prefetch).toHaveBeenCalledWith("/en/intake/dashboard");
  });

  it("hands off to Dashboard once, only after SPLASH_DURATION_MS", () => {
    renderPage();
    act(() => {
      vi.advanceTimersByTime(SPLASH_DURATION_MS - 1);
    });
    expect(replace).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/en/intake/dashboard");
  });
});
