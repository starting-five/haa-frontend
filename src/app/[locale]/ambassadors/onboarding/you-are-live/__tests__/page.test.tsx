import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SPLASH_DURATION_MS } from "@/lib/constants";
import en from "../../../../../../../messages/en.json";
import es from "../../../../../../../messages/es.json";

// "You're live" shows the brand mark in a rounded, clipped box. The bounce is on
// the box, not the image inside it — moving the image would crop its top edge
// against the box — and the screen still hands off to first steps on the delay.

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));

vi.mock("@/hooks/use-require-session-key", () => ({ useRequireSessionKey: () => {} }));

import AmbassadorYouAreLivePage from "../page";

const renderPage = (locale: string, messages: typeof en) =>
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
    >
      <AmbassadorYouAreLivePage />
    </NextIntlClientProvider>
  );

describe("ambassador you-are-live", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replace.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["en", en],
    ["es", es],
  ])("bounces the clipped mark box as one piece (%s)", (locale, messages) => {
    const { container } = renderPage(locale, messages);
    expect(screen.getByRole("heading", { name: messages.OnboardingAmbassadorScanCredit.heading })).toBeInTheDocument();

    const mark = container.querySelector('img[src*="haa.png"]');
    const box = mark?.parentElement;
    const bounce = mark?.closest(".animate-haa-bounce");

    expect(box).toHaveClass("overflow-hidden");
    expect(box).not.toHaveClass("animate-haa-bounce");
    expect(bounce).not.toBeNull();
    expect(bounce).toHaveClass("motion-reduce:animate-none");
    expect(bounce).toContainElement(box as HTMLElement);
  });

  it("still hands off to first steps once, after the shared delay", () => {
    renderPage("en", en);

    act(() => {
      vi.advanceTimersByTime(SPLASH_DURATION_MS - 1);
    });
    expect(replace).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/en/ambassadors/onboarding/first-steps");
  });
});
