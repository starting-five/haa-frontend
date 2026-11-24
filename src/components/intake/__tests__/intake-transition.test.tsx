import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { IntakeTransition } from "../intake-transition";
import { SPLASH_DURATION_MS } from "@/lib/constants";

// Every buttonless interstitial shares this component, so its timing contract
// is the flow's timing contract: one advance, after the shared delay, as a
// history replacement so Back never lands on a screen that leaves again.

const replace = vi.fn();
const push = vi.fn();
const prefetch = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      signOut: vi.fn(async () => ({ error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push, prefetch }),
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/intake",
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("intake transition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replace.mockReset();
    push.mockReset();
    prefetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances once, after the shared delay, by replacing history", () => {
    render(
      <IntakeTransition
        heading="Help is on the way"
        nextPath="/en/intake"
      />
    );
    expect(screen.getByRole("heading", { name: "Help is on the way" })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(SPLASH_DURATION_MS - 1);
    });
    expect(replace).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/en/intake");
    expect(push).not.toHaveBeenCalled();
    // The payload was asked for while the screen was still showing.
    expect(prefetch).toHaveBeenCalledWith("/en/intake");

    act(() => {
      vi.advanceTimersByTime(SPLASH_DURATION_MS * 3);
    });
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("does not advance after unmounting", () => {
    const view = render(
      <IntakeTransition
        heading="Get what you deserve."
        subtext="Making legal and treatment easier."
        nextPath="/en/intake/evidence"
        showHeader
      />
    );
    expect(screen.getByText("Making legal and treatment easier.")).toBeTruthy();
    view.unmount();

    act(() => {
      vi.advanceTimersByTime(SPLASH_DURATION_MS * 2);
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it("bounces the brand mark, and leaves a character illustration still", () => {
    const view = render(
      <IntakeTransition
        heading="Help is on the way"
        nextPath="/en/intake"
      />
    );
    const bounce = screen.getByAltText("HelpAfterAccident").closest(".animate-haa-bounce");
    expect(bounce).not.toBeNull();
    expect(bounce).toHaveClass("motion-reduce:animate-none");
    view.unmount();

    const { container } = render(
      <IntakeTransition
        heading="We've got it."
        nextPath="/en/intake/choose-attorney"
        illustration={{ src: "/assets/intake/ready.webp", width: 690, height: 770 }}
      />
    );
    expect(container.querySelector(".animate-haa-bounce")).toBeNull();
  });

  it("advances on the shared SPLASH_DURATION_MS constant, not a patient-flow-specific one", () => {
    expect(SPLASH_DURATION_MS).toBe(2500);
  });
});

// Figma draws these screens at two scales. P-302 (4817:19579) — the beat after
// the code is accepted — is set smaller and quieter than the splash screens,
// and adding it must not move the four screens that were already here.
describe("the two interstitial scales", () => {
  const stackOf = (subtext: HTMLElement) => subtext.parentElement?.parentElement;

  it("draws the verified screen at the design's H2 over Subtitle grey", () => {
    render(
      <IntakeTransition
        heading="Verified"
        subtext="Next step accident details"
        nextPath="/en/intake/incident"
        variant="verified"
      />
    );

    const heading = screen.getByRole("heading", { name: "Verified" });
    expect(heading.className).toContain("text-[28px]");
    expect(heading.className).toContain("font-extrabold");
    expect(heading.className).toContain("leading-[104%]");

    const subtext = screen.getByText("Next step accident details");
    expect(subtext.className).toContain("text-[16px]");
    expect(subtext.className).toContain("font-normal");
    expect(subtext.className).toContain("text-[#5c5c5c]");

    // 24 between the mark and the title block, 8 inside it.
    expect(stackOf(subtext)?.className).toContain("gap-[24px]");
    expect(subtext.parentElement?.className).toContain("gap-[8px]");

    const mark = screen.getByAltText("HelpAfterAccident");
    expect(mark.getAttribute("width")).toBe("150");
    expect(mark.getAttribute("height")).toBe("150");
  });

  it("leaves the splash screens exactly as they were", () => {
    render(
      <IntakeTransition
        heading="We've got it."
        subtext="Now let's find the right attorney for you."
        nextPath="/en/intake/choose-attorney"
      />
    );

    const heading = screen.getByRole("heading", { name: "We've got it." });
    expect(heading.className).toContain("text-[36px]");
    expect(heading.className).toContain("leading-[95%]");

    const subtext = screen.getByText("Now let's find the right attorney for you.");
    expect(subtext.className).toContain("text-[14px]");
    expect(subtext.className).toContain("text-[#cc007e]");

    expect(stackOf(subtext)?.className).toContain("gap-[32px]");
    expect(subtext.parentElement?.className).toContain("gap-[12px]");

    const mark = screen.getByAltText("HelpAfterAccident");
    expect(mark.getAttribute("width")).toBe("141");
    expect(mark.getAttribute("height")).toBe("141");
  });

  it("bounces the mark on the verified screen too, on the shared 2 s loop", () => {
    render(
      <IntakeTransition
        heading="Verified"
        subtext="Next step accident details"
        nextPath="/en/intake/incident"
        variant="verified"
      />
    );

    const bounce = screen.getByAltText("HelpAfterAccident").closest(".animate-haa-bounce");
    expect(bounce).not.toBeNull();
    expect(bounce).toHaveClass("motion-reduce:animate-none");
  });
});
