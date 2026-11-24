import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";
import { SUPPORT_PHONE_TEL } from "@/lib/constants";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/ambassadors/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);
vi.mock("next/image", () => ({
  default: () => <span data-testid="next-image" />,
}));

import AmbassadorDashboardPage from "../page";

const renderPage = () =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={en}
    >
      <AmbassadorDashboardPage />
    </NextIntlClientProvider>
  );

// "QR SCANS & CLICKS" is Dub's recorded link clicks plus QR scans. When the
// figures cannot be read the count must not claim zero: it keeps what it had,
// or reads "—" when there is nothing yet.
describe("ambassador dashboard QR scans & clicks", () => {
  const answerAnalytics = (response: Response) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("/api/ambassadors/analytics") ? response.clone() : new Response(null, { status: 404 })
      )
    );

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the count Dub recorded", async () => {
    answerAnalytics(
      Response.json({ clicks: 4, scans: 3, totalClicksAndScans: 7, totalClicks: 7, leads: 1 }, { status: 200 })
    );

    renderPage();

    expect(screen.getByRole("link", { name: en.ScreenHeader.call })).toHaveAttribute("href", SUPPORT_PHONE_TEL);
    expect(await screen.findByText("7")).toBeInTheDocument();
    expect(screen.queryByTestId("click-count-unavailable")).not.toBeInTheDocument();
  });

  it("shows a real zero when Dub recorded none", async () => {
    answerAnalytics(
      Response.json({ clicks: 0, scans: 0, totalClicksAndScans: 0, totalClicks: 0, leads: 0 }, { status: 200 })
    );

    renderPage();

    expect(await screen.findByText("0")).toBeInTheDocument();
  });

  it("reads '—', not zero, when the figures are unavailable", async () => {
    answerAnalytics(Response.json({ error: "analytics_unavailable" }, { status: 503 }));

    renderPage();

    expect(await screen.findByTestId("click-count-unavailable")).toHaveTextContent("—");
    expect(screen.queryByLabelText("Loading clicks")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

// On Muhammad Test an ambassador copied their link, had it opened elsewhere and
// came back to a dashboard that had asked for its figures once, when it loaded:
// nothing asks again unless Dub's webhook broadcasts. The route now says when
// newer figures can exist (refreshInMs); the dashboard asks then, only while it
// is on screen, and at once when the ambassador comes back to it.
describe("ambassador dashboard keeps QR scans & clicks current while it is open", () => {
  let visibility: DocumentVisibilityState = "visible";
  let analyticsRequests = 0;

  const answerInTurn = (...responses: Response[]) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (!String(input).includes("/api/ambassadors/analytics")) return new Response(null, { status: 404 });
        const response = responses[Math.min(analyticsRequests, responses.length - 1)];
        analyticsRequests += 1;
        return response.clone();
      })
    );
  const figures = (total: number, refreshInMs: number) =>
    Response.json(
      { clicks: total, scans: 0, totalClicksAndScans: total, totalClicks: total, leads: 0, refreshInMs },
      { status: 200 }
    );
  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  beforeEach(() => {
    sessionStorage.clear();
    analyticsRequests = 0;
    visibility = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, "visibilityState");
  });

  it("asks again when the route says newer figures can exist, and shows them", async () => {
    answerInTurn(figures(3, 5_000), figures(4, 30_000));

    renderPage();
    expect(await screen.findByText("3")).toBeInTheDocument();

    advance(4_900);
    expect(analyticsRequests).toBe(1);

    advance(1_000);
    expect(await screen.findByText("4")).toBeInTheDocument();
    expect(analyticsRequests).toBe(2);
  });

  it("does not ask while the page is out of sight, and asks the moment it is back", async () => {
    answerInTurn(figures(3, 1_000), figures(4, 30_000));

    renderPage();
    expect(await screen.findByText("3")).toBeInTheDocument();

    visibility = "hidden";
    advance(10_000);
    expect(analyticsRequests).toBe(1);

    visibility = "visible";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await screen.findByText("4")).toBeInTheDocument();
    expect(analyticsRequests).toBe(2);
  });

  it("asks again when the window regains focus", async () => {
    answerInTurn(figures(3, 30_000), figures(4, 30_000));

    renderPage();
    expect(await screen.findByText("3")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(await screen.findByText("4")).toBeInTheDocument();
  });

  it("keeps the count it had through a failed refresh — never 0 — and tries again", async () => {
    answerInTurn(
      figures(3, 1_000),
      Response.json({ error: "analytics_unavailable", refreshInMs: 1_000 }, { status: 503 }),
      figures(4, 30_000)
    );

    renderPage();
    expect(await screen.findByText("3")).toBeInTheDocument();

    // no DOM change marks the failed answer, so step the clock until the retry is made
    const stepUntilRequests = (count: number) =>
      vi.waitFor(() => {
        advance(250);
        expect(analyticsRequests).toBe(count);
      });

    await stepUntilRequests(2);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByTestId("click-count-unavailable")).not.toBeInTheDocument();

    await stepUntilRequests(3);
    expect(await screen.findByText("4")).toBeInTheDocument();
  });

  it("stops asking once the dashboard is closed, even mid-request", async () => {
    let answerSecond: (response: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (!String(input).includes("/api/ambassadors/analytics")) return new Response(null, { status: 404 });
        analyticsRequests += 1;
        if (analyticsRequests === 1) return figures(3, 1_000);
        return new Promise<Response>((resolve) => (answerSecond = resolve));
      })
    );

    const { unmount } = renderPage();
    expect(await screen.findByText("3")).toBeInTheDocument();
    await vi.waitFor(() => {
      advance(250);
      expect(analyticsRequests).toBe(2);
    });

    // closed while the refresh is still waiting on the server
    unmount();
    answerSecond(figures(4, 1_000));
    await act(async () => {});

    advance(60_000);
    expect(analyticsRequests).toBe(2);
  });
});
