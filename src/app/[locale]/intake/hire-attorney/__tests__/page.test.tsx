import { Activity } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en.json";

// Hire attorney is a confirmation, not the place signing happens: its button
// opens the agreement screen and nothing else. These pin that it creates no
// agreement of its own, never leaves the application, and asks the patient for
// nothing beyond what intake already collected.
//
// It is also the first screen of the retainer, which now waits for the Admin
// Dashboard: it is shown only while the backend says the case has been
// accepted and is not signed yet. The guard is the real one, driven through the
// backend calls it makes.
//
// Real messages are used rather than a stub, so a missing translation key fails
// here instead of showing the patient a raw key.

// jsdom has no navigation and its location.href is non-configurable, so the
// object is swapped once for a plain stand-in. It carries the real origin and
// protocol because next/image resolves image URLs against them.
const realLocation = window.location;
const locationStub = {
  href: realLocation.href,
  origin: realLocation.origin,
  protocol: realLocation.protocol,
  host: realLocation.host,
  hostname: realLocation.hostname,
  port: realLocation.port,
  pathname: realLocation.pathname,
  search: realLocation.search,
  hash: realLocation.hash,
};
Object.defineProperty(window, "location", { configurable: true, writable: true, value: locationStub });

const push = vi.fn();
const replace = vi.fn();
const router = { push, replace, prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/intake/hire-attorney",
  // one router for the whole test, as Next gives a page: the guard's effect is
  // keyed on it, and a new object per render would re-run it on every render
  useRouter: () => router,
  useParams: () => ({ locale: "en" }),
}));
// the header this page renders builds a Supabase client and watches auth state
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);

// The DocuSign launch flag is the one thing that decides where the tap goes;
// each test states the flag it runs under so the file documents both routes.
const launchEnabled = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/constants", async () => {
  const actual = await vi.importActual<typeof import("@/lib/constants")>("@/lib/constants");
  return {
    ...actual,
    get DOCUSIGN_LAUNCH_ENABLED() {
      return launchEnabled.value;
    },
  };
});

const createAgreement = vi.fn();
const getPatientDashboard = vi.fn();
const getAgreementStatus = vi.fn();
vi.mock("@/services/intake", () => ({
  createAgreement: (...args: unknown[]) => createAgreement(...args),
  getPatientDashboard: (...args: unknown[]) => getPatientDashboard(...args),
  getAgreementStatus: (...args: unknown[]) => getAgreementStatus(...args),
}));

const SUBMISSION_ID = "eee0b2d0-2362-494c-a890-eb1e9931fe33";

const dashboardWith = (overrides: Record<string, unknown> = {}) => ({
  patient: { firstName: "Alex", lastName: "Rivera", mobile: "+15551230777", email: null },
  cases: [
    {
      submissionId: SUBMISSION_ID,
      status: "retainer_pending_signature",
      submittedAt: "2026-09-28T00:00:00.000Z",
      locale: "en",
      treatmentArea: "San Jose, CA",
      incidentType: "car_accident",
      incidentLocation: "San Jose, CA",
      role: "driver",
      incidentDate: "2026-09-27",
      agreementStatus: null,
      awaitingSignature: true,
      ...overrides,
    },
  ],
});

import { PLACEHOLDER_ATTORNEY } from "@/lib/providers";
import HireAttorneyPage from "../page";

const renderPage = () =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
    >
      <HireAttorneyPage />
    </NextIntlClientProvider>
  );

const expectSentToDashboard = async () => {
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/intake/dashboard"));
  expect(screen.queryByRole("button", { name: messages.IntakeHireAttorney.signAgreement })).not.toBeInTheDocument();
  expect(screen.queryByText(messages.IntakeHireAttorney.heading)).not.toBeInTheDocument();
  expect(createAgreement).not.toHaveBeenCalled();
};

const clickSign = async () => {
  const button = await screen.findByRole("button", { name: messages.IntakeHireAttorney.signAgreement });
  fireEvent.click(button);
};

describe("hire attorney", () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    createAgreement.mockReset();
    getAgreementStatus.mockReset();
    getPatientDashboard.mockReset().mockResolvedValue(dashboardWith());
    sessionStorage.clear();
    sessionStorage.setItem("intake_submissionId", SUBMISSION_ID);
    // Kept a valid URL: next/image resolves image sources against it.
    locationStub.href = realLocation.href;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the agreement screen and nothing else when DocuSign launch is enabled", async () => {
    launchEnabled.value = true;
    renderPage();
    await clickSign();

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/en/intake/agreement");
    // No envelope, no signing URL and no page outside the application from here.
    expect(createAgreement).not.toHaveBeenCalled();
    expect(locationStub.href).toBe(realLocation.href);
  });

  it("still opens the agreement screen while DocuSign launch is disabled — the notice lives there", async () => {
    launchEnabled.value = false;
    renderPage();
    await clickSign();

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/en/intake/agreement");
    // Still no envelope, no signing URL, no popup and no page outside the application.
    expect(createAgreement).not.toHaveBeenCalled();
    expect(locationStub.href).toBe(realLocation.href);
  });

  it("does not open the next screen twice on a double tap", async () => {
    launchEnabled.value = true;
    renderPage();
    await clickSign();
    await clickSign();

    expect(push).toHaveBeenCalledTimes(1);
  });

  it("asks the patient for nothing beyond what intake already collected", async () => {
    renderPage();
    await screen.findByRole("button", { name: messages.IntakeHireAttorney.signAgreement });

    // No email prompt, and no email-specific copy anywhere on the screen.
    expect(screen.queryByPlaceholderText(/email/i)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/email/i);
  });

  it("keeps the phone line as the way to speak to someone first", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: messages.IntakeHireAttorney.speakToSomeone }));

    expect(locationStub.href).toMatch(/^tel:/);
    expect(push).not.toHaveBeenCalled();
  });

  it("draws the frame's heading, copy and spacing (Figma 1968:2832)", async () => {
    renderPage();

    const heading = await screen.findByRole("heading", { name: messages.IntakeHireAttorney.heading });
    const notice = screen.getByText(/unless money is recovered/);
    // Inter Regular 14 in brand magenta, only FREE in bold, 8px under the heading.
    expect(notice.className).toContain("font-normal");
    // Inter's own line height (17px at 14), not the inherited 1.5 — it sets where the body starts.
    expect(notice.className).toContain("leading-[normal]");
    expect(notice.className).toContain("text-[#cc007e]");
    expect(screen.getByText("FREE").className).toContain("font-bold");
    expect(notice.parentElement?.className).toContain("mt-[8px]");
    expect(heading.parentElement?.className).toContain("pt-[24px]");
    expect(screen.getByText(PLACEHOLDER_ATTORNEY.name).className).toContain("font-black");
  });
});

describe("hire attorney is offered only for an accepted, unsigned case", () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    createAgreement.mockReset();
    getAgreementStatus.mockReset();
    getPatientDashboard.mockReset();
    sessionStorage.clear();
    launchEnabled.value = true;
  });

  it("shows the screen for a case the admin has accepted", async () => {
    getPatientDashboard.mockResolvedValue(dashboardWith());
    renderPage();

    expect(await screen.findByRole("button", { name: messages.IntakeHireAttorney.signAgreement })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("carries the backend's case to the agreement screen when the tab holds none — a patient who signed in again", async () => {
    getPatientDashboard.mockResolvedValue(dashboardWith());
    renderPage();

    await screen.findByRole("button", { name: messages.IntakeHireAttorney.signAgreement });
    expect(sessionStorage.getItem("intake_submissionId")).toBe(SUBMISSION_ID);
  });

  it("replaces a stale submission id in the tab with the backend's", async () => {
    sessionStorage.setItem("intake_submissionId", "someone-elses-earlier-case");
    getPatientDashboard.mockResolvedValue(dashboardWith());
    renderPage();

    await screen.findByRole("button", { name: messages.IntakeHireAttorney.signAgreement });
    expect(sessionStorage.getItem("intake_submissionId")).toBe(SUBMISSION_ID);
  });

  it("sends a case still in review back to the dashboard, whatever the tab holds", async () => {
    sessionStorage.setItem("intake_submissionId", SUBMISSION_ID);
    getPatientDashboard.mockResolvedValue(dashboardWith({ status: "submitted", awaitingSignature: false }));
    renderPage();

    await expectSentToDashboard();
  });

  it("sends a turned-down case back to the dashboard", async () => {
    getPatientDashboard.mockResolvedValue(dashboardWith({ status: "not_qualified", awaitingSignature: false }));
    renderPage();

    await expectSentToDashboard();
  });

  it("does not offer a second signing to a patient who has signed", async () => {
    getPatientDashboard.mockResolvedValue(
      dashboardWith({ status: "signed", agreementStatus: "completed", awaitingSignature: false })
    );
    renderPage();

    await expectSentToDashboard();
  });

  it("asks DocuSign's status through the backend when an envelope is already out, and stands down if it is signed", async () => {
    getPatientDashboard.mockResolvedValue(dashboardWith({ agreementStatus: "sent" }));
    getAgreementStatus.mockResolvedValue({ ok: true, status: "completed" });
    renderPage();

    await expectSentToDashboard();
    expect(getAgreementStatus).toHaveBeenCalledWith(SUBMISSION_ID);
  });

  it("still offers an envelope that is out but not signed", async () => {
    getPatientDashboard.mockResolvedValue(dashboardWith({ agreementStatus: "delivered" }));
    getAgreementStatus.mockResolvedValue({ ok: true, status: "delivered" });
    renderPage();

    expect(await screen.findByRole("button", { name: messages.IntakeHireAttorney.signAgreement })).toBeInTheDocument();
  });

  it("fails closed when the dashboard cannot be read", async () => {
    sessionStorage.setItem("intake_submissionId", SUBMISSION_ID);
    getPatientDashboard.mockRejectedValue(new Error("Dashboard request failed with status 401"));
    renderPage();

    await expectSentToDashboard();
  });

  it("fails closed when a backend predating the field says nothing about signing", async () => {
    const legacy = dashboardWith();
    delete (legacy.cases[0] as Record<string, unknown>).awaitingSignature;
    getPatientDashboard.mockResolvedValue(legacy);
    renderPage();

    await expectSentToDashboard();
  });
});

// Leaving and coming back (cacheComponents keeps the page in a hidden
// <Activity>, state intact). Review and Sign Agreement was left greyed out after
// a trip to the agreement and back, so the retainer could not be reopened.
describe("hire-attorney after the patient leaves and comes back", () => {
  const tree = (mode: "visible" | "hidden") => (
    <NextIntlClientProvider
      locale="en"
      messages={messages}
    >
      <Activity mode={mode}>
        <HireAttorneyPage />
      </Activity>
    </NextIntlClientProvider>
  );
  const sign = () => screen.findByRole("button", { name: messages.IntakeHireAttorney.signAgreement });

  // the same starting point as the suite above: a case accepted and not signed
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    createAgreement.mockReset();
    getAgreementStatus.mockReset();
    getPatientDashboard.mockReset().mockResolvedValue(dashboardWith());
    sessionStorage.clear();
    sessionStorage.setItem("intake_submissionId", SUBMISSION_ID);
    locationStub.href = realLocation.href;
  });

  it("offers Review and Sign Agreement again, and it opens the agreement again", async () => {
    launchEnabled.value = true;
    const view = render(tree("visible"));
    fireEvent.click(await sign());
    expect(push).toHaveBeenCalledWith("/en/intake/agreement");

    await act(async () => view.rerender(tree("hidden")));
    await act(async () => view.rerender(tree("visible")));

    const again = await sign();
    expect(again).toBeEnabled();
    fireEvent.click(again);
    expect(push).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenLastCalledWith("/en/intake/agreement");
    expect(createAgreement).not.toHaveBeenCalled();
  });

  it("does not offer the signing again to a case signed meanwhile", async () => {
    const view = render(tree("visible"));
    fireEvent.click(await sign());
    await act(async () => view.rerender(tree("hidden")));

    getPatientDashboard.mockResolvedValue(
      dashboardWith({ status: "signed", agreementStatus: "completed", awaitingSignature: false })
    );
    await act(async () => view.rerender(tree("visible")));

    await expectSentToDashboard();
  });
});
