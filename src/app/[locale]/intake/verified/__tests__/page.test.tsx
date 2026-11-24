import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";
import { SPLASH_DURATION_MS } from "@/lib/constants";

// Figma 4817:19579 (P-302). The screen the patient sees the instant the code
// is accepted: it says what happened, names what is next, and carries itself
// on to the accident questions. It asks the backend for nothing — the case was
// opened by the code screen, and nothing here may open a second one.

const nav = vi.hoisted(() => ({ locale: "en" }));
const replace = vi.fn();
const push = vi.fn();
const prefetch = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push, prefetch }),
  useParams: () => ({ locale: nav.locale }),
  usePathname: () => `/${nav.locale}/intake/verified`,
}));

const requireSessionKey = vi.fn();
vi.mock("@/hooks/use-require-session-key", () => ({
  useRequireSessionKey: (key: string, fallback: string) => requireSessionKey(key, fallback),
}));

const intakeService = vi.hoisted(() => ({
  startIntake: vi.fn(),
  completeIntake: vi.fn(),
  getRegistrationStatus: vi.fn(),
}));
vi.mock("@/services/intake", () => intakeService);

import IntakeVerifiedPage from "../page";

const wrap = (messages: typeof en | typeof es, locale: string) => {
  nav.locale = locale;
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
    >
      <IntakeVerifiedPage />
    </NextIntlClientProvider>
  );
};

describe("the verified interstitial", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replace.mockReset();
    push.mockReset();
    prefetch.mockReset();
    requireSessionKey.mockReset();
    intakeService.startIntake.mockReset();
    intakeService.completeIntake.mockReset();
    intakeService.getRegistrationStatus.mockReset();
    sessionStorage.clear();
    sessionStorage.setItem("intake_submissionId", "sub-1");
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    nav.locale = "en";
  });

  it("shows the design's words, at the design's scale", () => {
    wrap(en, "en");

    const heading = screen.getByRole("heading", { name: "Verified" });
    const subtext = screen.getByText("Next step accident details");
    expect(heading).toBeTruthy();
    expect(subtext).toBeTruthy();

    // P-302 is set smaller and quieter than the splash screens, so the screen
    // has to ask the shared interstitial for that scale rather than the default.
    expect(heading.className).toContain("text-[28px]");
    expect(subtext.className).toContain("text-[16px]");
    expect(subtext.className).toContain("text-[#5c5c5c]");
  });

  it("takes those words from the message catalogue rather than the page", () => {
    wrap(en, "en");

    expect(screen.getByRole("heading", { name: en.IntakeVerified.heading })).toBeTruthy();
    expect(screen.getByText(en.IntakeVerified.subtext)).toBeTruthy();
  });

  it("shows the Spanish words, and goes on to the Spanish accident screen", () => {
    wrap(es, "es");

    expect(screen.getByRole("heading", { name: es.IntakeVerified.heading })).toBeTruthy();
    expect(screen.getByText(es.IntakeVerified.subtext)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(SPLASH_DURATION_MS);
    });
    expect(replace).toHaveBeenCalledWith("/es/intake/incident");
  });

  it("carries the flow on to the accident screen by itself, once", () => {
    wrap(en, "en");

    act(() => {
      vi.advanceTimersByTime(SPLASH_DURATION_MS - 1);
    });
    expect(replace).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/en/intake/incident");

    // Nothing left to fire, so the patient cannot be moved on twice.
    act(() => {
      vi.advanceTimersByTime(SPLASH_DURATION_MS * 4);
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("replaces itself in history, so Back from the accident screen skips it", () => {
    wrap(en, "en");

    act(() => {
      vi.advanceTimersByTime(SPLASH_DURATION_MS);
    });
    expect(push).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/en/intake/incident");
  });

  it("stands behind the code screen: it demands the case the code screen opened", () => {
    wrap(en, "en");

    expect(requireSessionKey).toHaveBeenCalledWith("intake_submissionId", "/intake/phone");
  });

  it("opens nothing and writes nothing — the case already exists", () => {
    const before = JSON.stringify({ ...sessionStorage });
    wrap(en, "en");

    act(() => {
      vi.advanceTimersByTime(SPLASH_DURATION_MS * 2);
    });

    expect(intakeService.startIntake).not.toHaveBeenCalled();
    expect(intakeService.completeIntake).not.toHaveBeenCalled();
    expect(intakeService.getRegistrationStatus).not.toHaveBeenCalled();
    expect(JSON.stringify({ ...sessionStorage })).toBe(before);
  });

  it("does not move a patient who has left the screen", () => {
    const view = wrap(en, "en");
    view.unmount();

    act(() => {
      vi.advanceTimersByTime(SPLASH_DURATION_MS * 2);
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it("warms the accident screen's tiles, and its payload, while it is showing", () => {
    const requested: string[] = [];
    const realImage = window.Image;
    class SpyImage {
      decoding = "";
      set src(value: string) {
        requested.push(value);
      }
    }
    window.Image = SpyImage as unknown as typeof realImage;

    try {
      wrap(en, "en");
    } finally {
      window.Image = realImage;
    }

    // The accident screen paints eight rendered tiles above the fold, and this
    // screen is the 2.5 s of runway they have to arrive in.
    expect(requested).toEqual([
      "/assets/intake/incident/car.webp",
      "/assets/intake/incident/motorcycle.webp",
      "/assets/intake/incident/truck.webp",
      "/assets/intake/incident/rideshare.webp",
      "/assets/intake/incident/slip-fall.webp",
      "/assets/intake/incident/pedestrian.webp",
      "/assets/intake/incident/bicycle.webp",
      "/assets/intake/incident/other.webp",
    ]);
    expect(prefetch).toHaveBeenCalledWith("/en/intake/incident");
  });
});
