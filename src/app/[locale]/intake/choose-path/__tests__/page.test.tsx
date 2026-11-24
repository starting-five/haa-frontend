import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en.json";
import { SUPPORT_PHONE_TEL } from "@/lib/constants";

// Choose How To Start offers two routes: do it on the phone (a brief selected
// state, then → tell) or talk to someone (→ the support line). Both behaviours
// are pinned, along with the copy the design specifies.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/intake/choose-path",
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));
// the header this page renders builds a Supabase client and watches auth state
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);
vi.mock("@/hooks/use-preload-images", () => ({ usePreloadImages: () => {} }));

// jsdom's location.href is non-configurable; swap in a writable stand-in.
const realLocation = window.location;
Object.defineProperty(window, "location", {
  configurable: true,
  writable: true,
  value: { ...realLocation, href: realLocation.href },
});

import IntakeChoosePathPage from "../page";

const renderPage = () =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
    >
      <IntakeChoosePathPage />
    </NextIntlClientProvider>
  );

describe("choose-path (Choose How To Start)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    push.mockReset();
    sessionStorage.clear();
    window.location.href = realLocation.href;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the heading, subtitle and both options", () => {
    renderPage();
    expect(screen.getByText(messages.IntakeChoosePath.heading)).toBeInTheDocument();
    expect(screen.getByText(messages.IntakeChoosePath.subtext)).toBeInTheDocument();
    expect(screen.getByText(messages.IntakeChoosePath.guideMe)).toBeInTheDocument();
    expect(screen.getByText(messages.IntakeChoosePath.talkToSomeone)).toBeInTheDocument();
  });

  it("sends the self-serve choice to the tell screen after the selected state", () => {
    renderPage();
    fireEvent.click(screen.getByText(messages.IntakeChoosePath.guideMe));
    expect(sessionStorage.getItem("intake_choosePath")).toBe("guideMe");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(push).toHaveBeenCalledWith("/en/intake/tell");
  });

  it("routes the talk-to-someone choice to the support line", () => {
    renderPage();
    fireEvent.click(screen.getByText(messages.IntakeChoosePath.talkToSomeone));
    expect(window.location.href).toBe(SUPPORT_PHONE_TEL);
    expect(push).not.toHaveBeenCalled();
  });
});
