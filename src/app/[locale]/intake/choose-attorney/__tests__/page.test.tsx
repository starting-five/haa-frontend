import { Activity } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";

// The matched attorney (Figma 5366:15577), reached from the dashboard once the
// Admin Dashboard has approved the case for the retainer. The guard is the real
// one, driven through the backend calls it makes: the screen is drawn only while
// the backend says the case is waiting for the patient's signature. Choose
// Attorney goes on to Hire Your Attorney; "Choose my own attorney" is drawn but
// can do nothing at all. Real messages are used so a dropped key fails here.

const nav = vi.hoisted(() => {
  const push = vi.fn();
  const replace = vi.fn();
  return { locale: "en", push, replace, router: { push, replace, prefetch: vi.fn() } };
});
vi.mock("next/navigation", () => ({
  usePathname: () => `/${nav.locale}/intake/choose-attorney`,
  useRouter: () => nav.router,
  useParams: () => ({ locale: nav.locale }),
}));
// the header this page renders builds a Supabase client and watches auth state
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);
vi.mock("@/hooks/use-preload-images", () => ({ usePreloadImages: () => {} }));

const backend = vi.hoisted(() => ({ dashboard: vi.fn(), agreementStatus: vi.fn(), createAgreement: vi.fn() }));
vi.mock("@/services/intake", () => ({
  getPatientDashboard: (...args: unknown[]) => backend.dashboard(...args),
  getAgreementStatus: (...args: unknown[]) => backend.agreementStatus(...args),
  createAgreement: (...args: unknown[]) => backend.createAgreement(...args),
}));

import { SUPPORT_PHONE_TEL } from "@/lib/constants";
import { PLACEHOLDER_ATTORNEY } from "@/lib/providers";
import IntakeChooseAttorneyPage from "../page";

const caseIn = (status: string, overrides: Record<string, unknown> = {}) => ({
  patient: { firstName: "Alex", lastName: "Rivera", mobile: "+15551230777", email: null },
  cases: [
    {
      submissionId: "s-choose",
      status,
      submittedAt: "2026-09-28T00:00:00.000Z",
      locale: "en",
      incidentType: "car_accident",
      incidentLocation: "San Jose, CA",
      agreementStatus: null,
      awaitingSignature: status === "retainer_pending_signature",
      ...overrides,
    },
  ],
});

const realLocation = window.location;
const locationStub = { ...realLocation, href: realLocation.href };

const renderPage = (locale: "en" | "es" = "en") => {
  nav.locale = locale;
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "es" ? es : en}
    >
      <IntakeChooseAttorneyPage />
    </NextIntlClientProvider>
  );
};

beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
  backend.dashboard.mockReset().mockResolvedValue(caseIn("retainer_pending_signature"));
  backend.agreementStatus.mockReset();
  backend.createAgreement.mockReset();
  sessionStorage.clear();
  locationStub.href = realLocation.href;
  Object.defineProperty(window, "location", { configurable: true, writable: true, value: locationStub });
});

describe("choose-attorney", () => {
  it("shows the matched firm and why, once the case is waiting for the signature", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { level: 1, name: en.IntakeChooseAttorney.heading })).toBeInTheDocument();
    expect(screen.getByText(en.IntakeChooseAttorney.subtext)).toBeInTheDocument();
    expect(screen.getByText(PLACEHOLDER_ATTORNEY.name)).toBeInTheDocument();
    expect(screen.getByText(en.IntakeChooseAttorney.whyGreatMatch)).toBeInTheDocument();
    for (const reason of ["caseTypeMatch", "winningPercentage", "responsiveness"] as const) {
      expect(screen.getByText(en.IntakeChooseAttorney[reason])).toBeInTheDocument();
    }
    // the agreement screens read the backend's case from the tab
    expect(sessionStorage.getItem("intake_submissionId")).toBe("s-choose");
  });

  it("goes on to Hire Your Attorney from Choose Attorney, once", async () => {
    renderPage();
    const choose = await screen.findByRole("button", { name: en.IntakeChooseAttorney.continue });

    fireEvent.click(choose);
    fireEvent.click(choose);

    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(nav.push).toHaveBeenCalledWith("/en/intake/hire-attorney");
    expect(backend.createAgreement).not.toHaveBeenCalled();
  });

  it("draws Choose my own attorney as coming soon, and it does nothing at all", async () => {
    renderPage();
    const own = await screen.findByRole("button", {
      name: `${en.IntakeChooseAttorney.chooseOwn} ${en.IntakeChooseAttorney.comingSoon}`,
    });

    expect(own).toBeDisabled();
    expect(own.className).toContain("bg-[#f8f8f8]");
    expect(screen.getByText(en.IntakeChooseAttorney.comingSoon).className).toContain("italic");

    fireEvent.click(own);
    fireEvent.keyDown(own, { key: "Enter" });
    fireEvent.keyDown(own, { key: " " });
    own.focus();

    expect(document.activeElement).not.toBe(own);
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(locationStub.href).toBe(realLocation.href);
    // the guard's one read of the dashboard, and nothing else
    expect(backend.dashboard).toHaveBeenCalledTimes(1);
    expect(backend.createAgreement).not.toHaveBeenCalled();
    expect(backend.agreementStatus).not.toHaveBeenCalled();
  });

  it("offers a call through Speak to someone first", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: en.IntakeChooseAttorney.speakToSomeone }));
    expect(locationStub.href).toBe(SUPPORT_PHONE_TEL);
  });

  it.each([
    ["in review", caseIn("submitted")],
    ["signed", caseIn("signed", { agreementStatus: "completed" })],
    ["closed", caseIn("not_qualified")],
    ["with no case", { patient: null, cases: [] }],
  ])("sends a case %s back to the dashboard, never drawing the firm", async (_label, dashboard) => {
    backend.dashboard.mockResolvedValue(dashboard);
    renderPage();

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/intake/dashboard"));
    expect(screen.queryByText(PLACEHOLDER_ATTORNEY.name)).toBeNull();
    expect(screen.queryByRole("button", { name: en.IntakeChooseAttorney.continue })).toBeNull();
  });

  it("sends the patient back when the dashboard cannot be read", async () => {
    backend.dashboard.mockRejectedValue(new Error("network"));
    renderPage();

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/intake/dashboard"));
    expect(screen.queryByText(PLACEHOLDER_ATTORNEY.name)).toBeNull();
  });

  it("is in Spanish", async () => {
    renderPage("es");

    expect(await screen.findByRole("button", { name: es.IntakeChooseAttorney.continue })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `${es.IntakeChooseAttorney.chooseOwn} ${es.IntakeChooseAttorney.comingSoon}` })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: es.IntakeChooseAttorney.continue }));
    expect(nav.push).toHaveBeenCalledWith("/es/intake/hire-attorney");
  });
});

// Leaving and coming back. With cacheComponents the App Router keeps a page the
// patient leaves in a hidden <Activity>: its state survives and its effects run
// again when it is shown. A fresh render cannot reproduce that, so these render
// the real page inside an Activity and move it hidden → visible, as a trip to
// the dashboard and back does. The button was left greyed out on the way back.
describe("choose-attorney after the patient leaves and comes back", () => {
  const tree = (mode: "visible" | "hidden") => (
    <NextIntlClientProvider
      locale="en"
      messages={en}
    >
      <Activity mode={mode}>
        <IntakeChooseAttorneyPage />
      </Activity>
    </NextIntlClientProvider>
  );
  const choose = () => screen.findByRole("button", { name: en.IntakeChooseAttorney.continue });

  beforeEach(() => {
    nav.locale = "en";
  });

  it("offers Choose Attorney on the first visit", async () => {
    render(tree("visible"));

    expect(await choose()).toBeEnabled();
    expect(screen.getByText(PLACEHOLDER_ATTORNEY.name)).toBeInTheDocument();
  });

  it("offers it again after Choose Attorney, the dashboard and back, and it goes on again", async () => {
    const view = render(tree("visible"));
    fireEvent.click(await choose());
    expect(nav.push).toHaveBeenCalledWith("/en/intake/hire-attorney");

    // off to Hire Your Attorney, back to the dashboard, the attorney icon again
    await act(async () => view.rerender(tree("hidden")));
    await act(async () => view.rerender(tree("visible")));

    const again = await choose();
    expect(again).toBeEnabled();
    fireEvent.click(again);
    expect(nav.push).toHaveBeenCalledTimes(2);
    expect(nav.push).toHaveBeenLastCalledWith("/en/intake/hire-attorney");
  });

  it("offers it again after leaving without choosing", async () => {
    const view = render(tree("visible"));
    await choose();

    await act(async () => view.rerender(tree("hidden")));
    await act(async () => view.rerender(tree("visible")));

    expect(await choose()).toBeEnabled();
  });

  it("asks the backend again on the way back, and draws nothing until it answers", async () => {
    const view = render(tree("visible"));
    fireEvent.click(await choose());
    await act(async () => view.rerender(tree("hidden")));

    let answer: (value: unknown) => void = () => {};
    backend.dashboard.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    await act(async () => view.rerender(tree("visible")));

    // not yet confirmed: the screen is withheld, not shown with a dead button
    expect(screen.queryByRole("button", { name: en.IntakeChooseAttorney.continue })).toBeNull();
    expect(screen.queryByText(PLACEHOLDER_ATTORNEY.name)).toBeNull();

    await act(async () => answer(caseIn("retainer_pending_signature")));
    expect(await choose()).toBeEnabled();
  });

  it("sends a case signed meanwhile back to the dashboard on the way back, never offering the firm", async () => {
    const view = render(tree("visible"));
    fireEvent.click(await choose());
    await act(async () => view.rerender(tree("hidden")));

    backend.dashboard.mockResolvedValue(caseIn("signed", { agreementStatus: "completed" }));
    await act(async () => view.rerender(tree("visible")));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/intake/dashboard"));
    expect(screen.queryByRole("button", { name: en.IntakeChooseAttorney.continue })).toBeNull();
    expect(screen.queryByText(PLACEHOLDER_ATTORNEY.name)).toBeNull();
  });
});
