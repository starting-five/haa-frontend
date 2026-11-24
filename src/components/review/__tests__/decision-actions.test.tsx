import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import es from "../../../../messages/es.json";

// Accept / Reject on the lawyer's review link. The deadline is the backend's;
// this component only counts it down for display and locks the buttons when it
// passes. The backend refuses a late decision regardless, so these tests pin
// the display and the lock, what is sent, and how each refusal is worded — never
// the backend's raw error code.

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { DecisionActions } from "../decision-actions";

const NOW = Date.parse("2026-09-29T12:00:00.000Z");
const fetchMock = vi.fn();

const renderActions = (props: Partial<Parameters<typeof DecisionActions>[0]> = {}, locale: "en" | "es" = "en") =>
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : es}
      timeZone="UTC"
    >
      <DecisionActions
        canDecide
        status="pending"
        responseDeadline={new Date(NOW + (2 * 24 + 3) * 60 * 60 * 1000 + 30 * 1000).toISOString()}
        {...props}
      />
    </NextIntlClientProvider>
  );

const settle = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const accept = () => screen.getByRole("button", { name: en.LawyerReviewDecision.accept });
const reject = () => screen.getByRole("button", { name: en.LawyerReviewDecision.decline });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.setSystemTime(NOW);
  fetchMock.mockReset();
  refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("review decision deadline", () => {
  it("shows the deadline and admin-style live countdown", async () => {
    renderActions();
    await settle();

    expect(screen.getByTestId("decision-countdown")).toHaveTextContent("02:03:00:30 left");
    expect(accept()).toBeEnabled();
  });

  it("uses the admin timer format as the deadline nears", async () => {
    renderActions({ responseDeadline: new Date(NOW + 95 * 60 * 1000).toISOString() });
    await settle();
    expect(screen.getByTestId("decision-countdown")).toHaveTextContent("01:35:00");

    await settle(60 * 60 * 1000);
    expect(screen.getByTestId("decision-countdown")).toHaveTextContent("35:00");

    await settle(35 * 60 * 1000 - 20 * 1000);
    expect(screen.getByTestId("decision-countdown")).toHaveTextContent("0:20");
  });

  it("locks both buttons the moment the deadline passes, and sends nothing", async () => {
    renderActions({ responseDeadline: new Date(NOW + 90 * 1000).toISOString() });
    await settle();
    expect(accept()).toBeEnabled();

    await settle(90 * 1000);

    expect(screen.queryByRole("button", { name: en.LawyerReviewDecision.accept })).toBeNull();
    expect(screen.queryByRole("button", { name: en.LawyerReviewDecision.decline })).toBeNull();
    expect(screen.getByText(en.LawyerReviewDecision.noDecision)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows no countdown when the server gave no deadline", async () => {
    renderActions({ responseDeadline: null });
    await settle();

    expect(screen.queryByTestId("decision-countdown")).toBeNull();
    expect(accept()).toBeEnabled();
  });

  it("counts down in Spanish", async () => {
    renderActions({}, "es");
    await settle();

    expect(screen.getByTestId("decision-countdown")).toHaveTextContent("Quedan 02:03:00:30");
    expect(screen.getByRole("button", { name: es.LawyerReviewDecision.accept })).toBeEnabled();
  });
});

describe("review decision", () => {
  it("sends only the action, locks, and reloads the page to show what acceptance unlocks", async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true, status: "qualified" }));
    renderActions();
    await settle();

    fireEvent.click(accept());
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/review/decision");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ action: "accept_case" });
    expect(screen.getByText(en.LawyerReviewDecision.accepted)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en.LawyerReviewDecision.accept })).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("words a refused late decision, rather than showing the backend's code", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "assignment_not_active" }, { status: 401 }));
    renderActions();
    await settle();

    fireEvent.click(reject());
    await settle();

    expect(screen.getByText(en.LawyerReviewDecision.noLongerOpen)).toBeInTheDocument();
    expect(screen.queryByText(/assignment_not_active/)).toBeNull();
    expect(screen.queryByRole("button", { name: en.LawyerReviewDecision.decline })).toBeNull();
  });

  it("locks when another decision already landed", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "decision_already_submitted" }, { status: 409 }));
    renderActions();
    await settle();

    fireEvent.click(accept());
    await settle();

    expect(screen.getByText(en.LawyerReviewDecision.alreadySubmitted)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en.LawyerReviewDecision.accept })).toBeNull();
  });

  it("locks when the backend says the decision window expired", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "decision_window_expired" }, { status: 409 }));
    renderActions();
    await settle();

    fireEvent.click(accept());
    await settle();

    expect(screen.getByText(en.LawyerReviewDecision.windowClosed)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en.LawyerReviewDecision.accept })).toBeNull();
  });

  it("keeps the buttons for a retry after a server error, with a readable message", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "decision_update_failed" }, { status: 500 }));
    renderActions();
    await settle();

    fireEvent.click(accept());
    await settle();

    expect(screen.getByText(en.LawyerReviewDecision.saveError)).toBeInTheDocument();
    expect(screen.queryByText(/decision_update_failed/)).toBeNull();
    expect(accept()).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("offers nothing once the review is decided", async () => {
    renderActions({ canDecide: false, status: "accepted" });
    await settle();

    expect(screen.queryByRole("button", { name: en.LawyerReviewDecision.accept })).toBeNull();
    expect(screen.getByText(en.LawyerReviewDecision.accepted)).toBeInTheDocument();
    expect(screen.queryByText(en.LawyerReviewDecision.alreadySubmitted)).toBeNull();
    expect(screen.queryByText(/^Current status:/)).toBeNull();
    expect(screen.queryByTestId("decision-countdown")).toBeNull();
  });
});
