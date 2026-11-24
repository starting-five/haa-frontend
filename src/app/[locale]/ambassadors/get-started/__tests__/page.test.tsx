import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SPLASH_DURATION_MS } from "@/lib/constants";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";

// The Brand Ambassador welcome is that flow's buttonless interstitial. Its mark
// carries the Patient Flow's bounce through the shared BrandMarkBounce, and the
// motion must not change where or when the screen moves on.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));

import AmbassadorsGetStartedPage from "../page";

const renderPage = (locale: string, messages: typeof en) =>
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
    >
      <AmbassadorsGetStartedPage />
    </NextIntlClientProvider>
  );

describe("ambassador get-started", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    push.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["en", en],
    ["es", es],
  ])("bounces the brand mark (%s)", (locale, messages) => {
    renderPage(locale, messages);

    const bounce = screen.getByAltText(messages.OnboardingAmbassadorPrestart.logoAlt).closest(".animate-haa-bounce");
    expect(bounce).not.toBeNull();
    expect(bounce).toHaveClass("motion-reduce:animate-none");
  });

  it("still moves on to onboarding once, after the shared delay", () => {
    renderPage("en", en);

    act(() => {
      vi.advanceTimersByTime(SPLASH_DURATION_MS - 1);
    });
    expect(push).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/en/ambassadors/onboarding");
  });
});
