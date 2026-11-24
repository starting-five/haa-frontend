import { Activity } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";

// "No case found" is what a signed-in account with no submitted case sees. The
// proxy sends signed-in visitors on the flow's entry routes back to this
// dashboard, so Start a new intake has to end that session, clear any earlier
// intake from the tab, and then open the Patient Flow at its entry, get-help.
// Whether it goes ahead is decided by the session left in the tab afterwards.

const nav = vi.hoisted(() => {
  const replace = vi.fn();
  const push = vi.fn();
  // one router for the page's whole life, as Next's useRouter is: a new object
  // per render would re-run the page's effect on every render
  return { locale: "en", replace, push, router: { replace, push, prefetch: vi.fn() } };
});
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/intake/dashboard",
  useRouter: () => nav.router,
  useParams: () => ({ locale: nav.locale }),
}));

const dashboard = vi.hoisted(() => ({ get: vi.fn(), agreementStatus: vi.fn() }));
vi.mock("@/services/intake", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/intake")>();
  return { ...actual, getPatientDashboard: dashboard.get, getAgreementStatus: dashboard.agreementStatus };
});

const auth = vi.hoisted(() => ({ signOut: vi.fn(), getSession: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: auth.signOut,
      getSession: auth.getSession,
    },
  }),
}));

import { PatientDashboardUnavailableError } from "@/services/intake";
import { SUPPORT_PHONE_TEL } from "@/lib/constants";
import { PLACEHOLDER_ATTORNEY, PLACEHOLDER_DOCTOR } from "@/lib/providers";
import IntakeDashboardPage from "../page";

const SESSION_GONE = { data: { session: null }, error: null };
const SESSION_KEPT = { data: { session: { access_token: "still-here" } }, error: null };

const realLocation = window.location;
const locationReplace = vi.fn();
const locationAssign = vi.fn();

const renderDashboard = (locale: "en" | "es" = "en") => {
  nav.locale = locale;
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "es" ? es : en}
    >
      <IntakeDashboardPage />
    </NextIntlClientProvider>
  );
};

const intakeKeys = () => Object.keys(sessionStorage).filter((key) => key.startsWith("intake_"));

const seedEarlierIntake = () => {
  sessionStorage.setItem("intake_submissionId", "sub-1");
  sessionStorage.setItem("intake_submitted", "1");
  sessionStorage.setItem("intake_firstName", "Ada");
  sessionStorage.setItem("intake_phone", "+15550001111");
  sessionStorage.setItem("onboarding_ambassador_username", "ada");
};

describe("patient dashboard with no submitted case", () => {
  beforeEach(() => {
    sessionStorage.clear();
    nav.replace.mockReset();
    nav.push.mockReset();
    locationReplace.mockReset();
    locationAssign.mockReset();
    auth.signOut.mockReset().mockResolvedValue({ error: null });
    auth.getSession.mockReset().mockResolvedValue(SESSION_GONE);
    dashboard.get.mockReset().mockRejectedValue(new PatientDashboardUnavailableError("intake_incomplete"));
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...realLocation, pathname: "/en/intake/dashboard", replace: locationReplace, assign: locationAssign },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, writable: true, value: realLocation });
  });

  it("shows No case found and does not try to navigate on its own", async () => {
    renderDashboard();

    expect(await screen.findByRole("heading", { name: en.IntakeDashboard.emptyTitle })).toBeInTheDocument();
    expect(screen.getByText(en.IntakeDashboard.emptyText)).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
    expect(locationReplace).not.toHaveBeenCalled();
  });

  it("keeps its own error for any other failure, and offers no way to start over", async () => {
    dashboard.get.mockRejectedValue(new Error("Dashboard request failed with status 500"));
    renderDashboard();

    expect(await screen.findByText(en.IntakeDashboard.errorText)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: en.IntakeDashboard.emptyTitle })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en.IntakeDashboard.emptyCta })).not.toBeInTheDocument();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("Start a new intake ends the session, clears the earlier intake and opens get-help", async () => {
    seedEarlierIntake();
    const order: string[] = [];
    auth.signOut.mockImplementation(async () => {
      order.push("signOut");
      return { error: null };
    });
    auth.getSession.mockImplementation(async () => {
      order.push(`session check with ${intakeKeys().length} intake keys`);
      return SESSION_GONE;
    });
    locationReplace.mockImplementation((url: string) => order.push(`open ${url}`));
    renderDashboard();

    const startNewIntake = await screen.findByRole("button", { name: en.IntakeDashboard.emptyCta });
    // The header checks the session once on mount. That is its business, not
    // this action's, so the sequence is recorded from the click onward — the
    // three steps below are still required, in this order.
    order.length = 0;
    fireEvent.click(startNewIntake);

    await waitFor(() => expect(locationReplace).toHaveBeenCalledTimes(1));
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(order).toEqual(["signOut", "session check with 4 intake keys", "open /en/get-help"]);
    expect(intakeKeys()).toEqual([]);
    expect(sessionStorage.getItem("onboarding_ambassador_username")).toBe("ada");
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("opens the Spanish entry for a Spanish patient", async () => {
    renderDashboard("es");

    fireEvent.click(await screen.findByRole("button", { name: es.IntakeDashboard.emptyCta }));

    await waitFor(() => expect(locationReplace).toHaveBeenCalledWith("/es/get-help"));
  });

  it("goes ahead when the logout call fails but the tab no longer holds a session", async () => {
    seedEarlierIntake();
    auth.signOut.mockResolvedValue({ error: new Error("fetch failed") });
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: en.IntakeDashboard.emptyCta }));

    await waitFor(() => expect(locationReplace).toHaveBeenCalledWith("/en/get-help"));
    expect(intakeKeys()).toEqual([]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the patient here, with the earlier intake untouched, while a session remains", async () => {
    seedEarlierIntake();
    auth.signOut.mockResolvedValue({ error: new Error("auth service unreachable") });
    auth.getSession.mockResolvedValue(SESSION_KEPT);
    renderDashboard();

    const button = await screen.findByRole("button", { name: en.IntakeDashboard.emptyCta });
    fireEvent.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent(en.IntakeDashboard.startNewIntakeError);
    expect(locationReplace).not.toHaveBeenCalled();
    expect(intakeKeys()).toHaveLength(4);
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "false");
  });

  it("judges a sign-out that throws by the session it leaves behind", async () => {
    auth.signOut.mockRejectedValue(new TypeError("network down"));
    auth.getSession.mockResolvedValue(SESSION_KEPT);
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: en.IntakeDashboard.emptyCta }));

    expect(await screen.findByRole("alert")).toHaveTextContent(en.IntakeDashboard.startNewIntakeError);
    expect(locationReplace).not.toHaveBeenCalled();
  });

  it("tells a Spanish patient in Spanish when starting over could not go ahead", async () => {
    auth.getSession.mockResolvedValue(SESSION_KEPT);
    renderDashboard("es");

    fireEvent.click(await screen.findByRole("button", { name: es.IntakeDashboard.emptyCta }));

    expect(await screen.findByRole("alert")).toHaveTextContent(es.IntakeDashboard.startNewIntakeError);
  });

  it("marks the button busy and ends the session once when two taps land before it re-renders", async () => {
    let finishSignOut: (value: { error: null }) => void = () => {};
    auth.signOut.mockImplementation(() => new Promise((resolve) => (finishSignOut = resolve)));
    renderDashboard();

    const button = await screen.findByRole("button", { name: en.IntakeDashboard.emptyCta });
    act(() => {
      button.click();
      button.click();
    });

    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    finishSignOut({ error: null });
    await waitFor(() => expect(locationReplace).toHaveBeenCalledTimes(1));
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  // Call sits in the header and the page ends with the tracker — there is no
  // Need help? / Contact HAA line under it any more.
  it("draws the standard header with Call and menu, and no Need help? line", async () => {
    dashboard.get.mockResolvedValue({
      patient: { firstName: "Alex", lastName: "Rivera", mobile: "+15551230777", email: null },
      cases: [
        {
          submissionId: "s1",
          status: "submitted",
          submittedAt: "2026-08-16T00:00:00.000Z",
          locale: "en",
          treatmentArea: "San Jose, CA",
          incidentType: "car_accident",
          incidentLocation: "San Jose, CA",
          role: "driver",
          incidentDate: "2026-08-15",
        },
      ],
    });
    renderDashboard();

    await screen.findByText(en.IntakeDashboard.yourTeam);
    expect(screen.queryByText(/Need help\?/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /contact haa/i })).toBeNull();
    expect(screen.getByRole("link", { name: en.ScreenHeader.call })).toHaveAttribute("href", SUPPORT_PHONE_TEL);
    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `${en.ScreenHeader.language}: English` })).toBeNull();
  });
});

// The dashboard through the attorney journey — in review (Figma 5366:15681),
// approved for the retainer (5366:15494) and signed (5366:15849) — each state
// read from the case status the backend returns, never from anything the browser
// kept (lib/attorney-stage.ts).
describe("patient dashboard through the attorney journey", () => {
  const caseIn = (status: string, overrides: Record<string, unknown> = {}) => ({
    patient: { firstName: "Alex", lastName: "Rivera", mobile: "+15551230777", email: null },
    cases: [
      {
        submissionId: "s-journey",
        status,
        submittedAt: "2026-08-16T00:00:00.000Z",
        locale: "en",
        treatmentArea: "San Jose, CA",
        incidentType: "car_accident",
        incidentLocation: "San Jose, CA",
        role: "driver",
        incidentDate: "2026-08-15",
        agreementStatus: null,
        awaitingSignature: status === "retainer_pending_signature",
        providers: { lawyer: { matched: false }, doctor: { matched: false } },
        ...overrides,
      },
    ],
  });
  const signedCase = (status = "signed") => caseIn(status, { agreementStatus: "completed", awaitingSignature: false });
  const steps = () => [...document.querySelectorAll("ol > li")] as HTMLElement[];
  const currentStep = () => document.querySelector('ol > li[aria-current="step"]')?.textContent;
  // the coloured part of the track, drawn over the grey one
  const run = () => document.querySelectorAll("ol > span")[1] as HTMLElement;
  const card = (member: "attorney" | "doctor") =>
    document.querySelector(`li[data-team-member="${member}"]`) as HTMLElement;
  const bellRings = (member: "attorney" | "doctor") =>
    card(member).querySelector("svg")?.getAttribute("class")?.includes("animate-haa-bell-ring") ?? false;

  beforeEach(() => {
    sessionStorage.clear();
    nav.replace.mockReset();
    nav.push.mockReset();
    locationAssign.mockReset();
    auth.getSession.mockReset().mockResolvedValue(SESSION_KEPT);
    dashboard.get.mockReset();
    dashboard.agreementStatus.mockReset();
  });

  it("runs Intake, Attorney, Attorney call, Doctor, Treating, Settled in every state", async () => {
    const order = [
      en.IntakeDashboard.stepIntake,
      en.IntakeDashboard.stepAttorney,
      en.IntakeDashboard.stepAttorneyCall,
      en.IntakeDashboard.stepDoctor,
      en.IntakeDashboard.stepTreating,
      en.IntakeDashboard.stepSettled,
    ];
    for (const status of ["submitted", "retainer_pending_signature", "signed", "attorney", "qualified", "doctor"]) {
      dashboard.get.mockResolvedValue(status === "signed" ? signedCase() : caseIn(status));
      const view = renderDashboard();
      await screen.findByText(en.IntakeDashboard.yourTeam);
      expect(steps().map((step) => step.textContent)).toEqual(order);
      view.unmount();
    }
  });

  it("in review: Case in review, no attorney named, Attorney ringed on a grey run", async () => {
    dashboard.get.mockResolvedValue(caseIn("submitted"));
    renderDashboard();

    expect(await screen.findByText(en.IntakeDashboard.caseInReview)).toBeInTheDocument();
    expect(screen.getByText(en.IntakeDashboard.caseInReview).closest("a")).toBeNull();

    const attorney = within(card("attorney")).getByRole("link", { name: en.IntakeDashboard.lawyerNotFound });
    expect(attorney).toHaveAttribute("aria-disabled", "true");
    expect(attorney).not.toHaveAttribute("href");
    expect(card("attorney")).toHaveTextContent(en.IntakeDashboard.findingAttorney);
    expect(screen.queryByText(/louis berk/i)).toBeNull();
    expect(screen.queryByText(en.IntakeDashboard.attorneyRecommended)).toBeNull();
    expect(screen.queryByText(en.IntakeDashboard.attorneyConnected)).toBeNull();
    // 5366:15681: both renders in colour, the attorney's bell ringing
    expect(card("attorney").querySelector("img")?.className).not.toContain("grayscale");
    expect(card("doctor").querySelector("img")?.className).not.toContain("grayscale");
    expect(bellRings("attorney")).toBe(true);
    expect(bellRings("doctor")).toBe(false);

    expect(currentStep()).toBe(en.IntakeDashboard.stepAttorney);
    expect(run().className).toContain("bg-[#d9d9d9]");
    expect(nav.replace).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("approved for the retainer: View matched attorney and the Recommended firm both open the matched attorney", async () => {
    dashboard.get.mockResolvedValue(caseIn("retainer_pending_signature"));
    renderDashboard();

    const upNext = await screen.findByRole("link", { name: new RegExp(en.IntakeDashboard.viewMatchedAttorney, "i") });
    expect(upNext).toHaveAttribute("href", "/en/intake/choose-attorney");

    const attorney = within(card("attorney")).getByRole("link");
    expect(attorney).toHaveAttribute("href", "/en/intake/choose-attorney");
    expect(attorney).toHaveTextContent(PLACEHOLDER_ATTORNEY.name);
    expect(attorney).toHaveTextContent(en.IntakeDashboard.attorneyRecommended);
    expect(attorney).not.toHaveTextContent(en.IntakeDashboard.attorneyConnected);
    expect(bellRings("attorney")).toBe(true);

    expect(currentStep()).toBe(en.IntakeDashboard.stepAttorney);
    expect(run().className).toContain("bg-[#cc007e]");
    // the patient chooses when to go on: nothing is opened for them
    expect(nav.replace).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("signed: Attorney will contact you, the firm Connected, and the run on Attorney call", async () => {
    dashboard.get.mockResolvedValue(signedCase());
    renderDashboard();

    expect(await screen.findByText(en.IntakeDashboard.attorneyWillContact)).toBeInTheDocument();
    expect(screen.getByText(en.IntakeDashboard.attorneyWillContact).closest("a")).toBeNull();
    const attorney = within(card("attorney")).getByRole("button");
    expect(attorney).toHaveAttribute("aria-haspopup", "dialog");
    expect(attorney).toHaveTextContent(PLACEHOLDER_ATTORNEY.name);
    expect(attorney).toHaveTextContent(en.IntakeDashboard.attorneyConnected);
    expect(attorney).not.toHaveTextContent(en.IntakeDashboard.attorneyRecommended);
    // a signed patient is never offered the attorney again
    expect(document.querySelector("a[href*='choose-attorney']")).toBeNull();
    expect(screen.queryByText(en.IntakeDashboard.viewMatchedAttorney)).toBeNull();

    expect(currentStep()).toBe(en.IntakeDashboard.stepAttorneyCall);
    expect(steps()[1].querySelector(".bg-\\[\\#cc007e\\]")).not.toBeNull();
    expect(run().className).toContain("bg-[#cc007e]");
    // two of the five stretches between the six steps, along the track between the end dots
    expect(run().style.width).toBe("calc(0.4 * (100% - 54px))");
  });

  it("opens the connected attorney's actions, where Group chat and Change attorney do nothing", async () => {
    dashboard.get.mockResolvedValue(signedCase());
    renderDashboard();

    await screen.findByText(en.IntakeDashboard.attorneyWillContact);
    fireEvent.click(within(card("attorney")).getByRole("button"));
    const dialog = await screen.findByRole("dialog", { name: en.ProviderScreen.attorneyDetails });

    for (const name of [en.ProviderScreen.groupChat, en.ProviderScreen.changeAttorney]) {
      const action = within(dialog).getByRole("button", { name });
      expect(action).toBeDisabled();
      expect(action).toHaveAccessibleDescription(en.ProviderScreen.unavailable);
      expect(action.className).toContain("bg-[#f8f8f8]");
      fireEvent.click(action);
      fireEvent.keyDown(action, { key: "Enter" });
      fireEvent.keyDown(action, { key: " " });
    }
    expect(screen.getByRole("dialog", { name: en.ProviderScreen.attorneyDetails })).toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(locationAssign).not.toHaveBeenCalled();
    expect(dashboard.get).toHaveBeenCalledTimes(1);
    expect(dashboard.agreementStatus).not.toHaveBeenCalled();

    // Attorney details is the one live row: the firm's contact popup
    fireEvent.click(within(dialog).getByRole("button", { name: en.ProviderScreen.attorneyDetails }));
    expect(await screen.findByText(PLACEHOLDER_ATTORNEY.contact.email)).toBeInTheDocument();
  });

  it("stays Connected once passed to a lawyer and accepted, with the lawyer's call up next", async () => {
    for (const status of ["attorney", "qualified"]) {
      dashboard.get.mockResolvedValue(signedCase(status));
      const view = renderDashboard();

      expect(await screen.findByText(en.IntakeDashboard.attorneyCall)).toBeInTheDocument();
      expect(within(card("attorney")).getByRole("button")).toHaveTextContent(en.IntakeDashboard.attorneyConnected);
      expect(currentStep()).toBe(en.IntakeDashboard.stepAttorneyCall);
      view.unmount();
    }
  });

  it("moves to Doctor at the doctor status, the doctor's card inert until the backend matches one", async () => {
    dashboard.get.mockResolvedValue(signedCase("doctor"));
    renderDashboard();

    expect(await screen.findAllByText(en.IntakeDashboard.findingDoctor)).not.toHaveLength(0);
    expect(currentStep()).toBe(en.IntakeDashboard.stepDoctor);
    const doctor = within(card("doctor")).getByRole("link", { name: en.IntakeDashboard.doctorNotFound });
    expect(doctor).toHaveAttribute("aria-disabled", "true");
    expect(bellRings("doctor")).toBe(false);
  });

  it("names no attorney for a case closed without representation, or a status it does not know", async () => {
    for (const status of ["not_qualified", "signed_pending", "retainer_signed", "unsigned"]) {
      dashboard.get.mockResolvedValue(caseIn(status));
      const view = renderDashboard();
      await screen.findByText(en.IntakeDashboard.yourTeam);

      expect(screen.queryByText(/louis berk/i)).toBeNull();
      expect(screen.queryByText(en.IntakeDashboard.attorneyConnected)).toBeNull();
      expect(screen.queryByText(en.IntakeDashboard.attorneyRecommended)).toBeNull();
      expect(within(card("attorney")).getByRole("link")).toHaveAttribute("aria-disabled", "true");
      expect(currentStep()).toBe(en.IntakeDashboard.stepAttorney);
      view.unmount();
    }
  });

  it("reads a case again when DocuSign has completed its envelope, and shows it signed", async () => {
    dashboard.get
      .mockResolvedValueOnce(caseIn("retainer_pending_signature", { agreementStatus: "sent" }))
      .mockResolvedValue(signedCase());
    dashboard.agreementStatus.mockResolvedValue({ ok: true, status: "completed" });
    renderDashboard();

    expect(await screen.findByText(en.IntakeDashboard.attorneyWillContact)).toBeInTheDocument();
    expect(dashboard.agreementStatus).toHaveBeenCalledWith("s-journey");
    expect(dashboard.get).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(en.IntakeDashboard.viewMatchedAttorney)).toBeNull();
    expect(screen.queryByText(en.IntakeDashboard.attorneyRecommended)).toBeNull();
  });

  it("keeps the firm Recommended while its envelope is out but unsigned", async () => {
    dashboard.get.mockResolvedValue(caseIn("retainer_pending_signature", { agreementStatus: "delivered" }));
    dashboard.agreementStatus.mockResolvedValue({ ok: true, status: "delivered" });
    renderDashboard();

    expect(await screen.findByText(en.IntakeDashboard.viewMatchedAttorney)).toBeInTheDocument();
    expect(dashboard.agreementStatus).toHaveBeenCalledWith("s-journey");
    expect(dashboard.get).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(en.IntakeDashboard.attorneyConnected)).toBeNull();
  });

  it("asks DocuSign nothing for a case that has no envelope out", async () => {
    for (const status of ["submitted", "retainer_pending_signature", "signed"]) {
      dashboard.get.mockResolvedValue(caseIn(status));
      const view = renderDashboard();
      await screen.findByText(en.IntakeDashboard.yourTeam);
      view.unmount();
    }
    expect(dashboard.agreementStatus).not.toHaveBeenCalled();
  });

  it("redraws the attorney when a refresh finds the case approved, then signed", async () => {
    dashboard.get.mockResolvedValue(caseIn("submitted"));
    renderDashboard();
    await screen.findByText(en.IntakeDashboard.caseInReview);

    dashboard.get.mockResolvedValue(caseIn("retainer_pending_signature"));
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(await screen.findByText(en.IntakeDashboard.attorneyRecommended)).toBeInTheDocument();

    dashboard.get.mockResolvedValue(signedCase());
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(await screen.findByText(en.IntakeDashboard.attorneyConnected)).toBeInTheDocument();
    expect(screen.queryByText(en.IntakeDashboard.attorneyRecommended)).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("is in Spanish through the journey", async () => {
    dashboard.get.mockResolvedValue(caseIn("retainer_pending_signature", { locale: "es" }));
    const view = renderDashboard("es");
    const upNext = await screen.findByRole("link", { name: new RegExp(es.IntakeDashboard.viewMatchedAttorney, "i") });
    expect(upNext).toHaveAttribute("href", "/es/intake/choose-attorney");
    expect(within(card("attorney")).getByRole("link")).toHaveTextContent(es.IntakeDashboard.attorneyRecommended);
    expect(currentStep()).toBe(es.IntakeDashboard.stepAttorney);
    view.unmount();

    dashboard.get.mockResolvedValue(signedCase());
    renderDashboard("es");
    expect(await screen.findByText(es.IntakeDashboard.attorneyWillContact)).toBeInTheDocument();
    expect(within(card("attorney")).getByRole("button")).toHaveTextContent(es.IntakeDashboard.attorneyConnected);
    expect(currentStep()).toBe(es.IntakeDashboard.stepAttorneyCall);
  });

  it("never shows the case as it was left when coming back from signing", async () => {
    nav.locale = "en";
    const tree = (mode: "visible" | "hidden") => (
      <NextIntlClientProvider
        locale="en"
        messages={en}
      >
        <Activity mode={mode}>
          <IntakeDashboardPage />
        </Activity>
      </NextIntlClientProvider>
    );
    dashboard.get.mockResolvedValue(caseIn("retainer_pending_signature"));
    const view = render(tree("visible"));
    expect(await screen.findByText(en.IntakeDashboard.attorneyRecommended)).toBeInTheDocument();

    // the patient leaves for the matched attorney and signs
    await act(async () => view.rerender(tree("hidden")));
    let answer: (value: unknown) => void = () => {};
    dashboard.get.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    await act(async () => view.rerender(tree("visible")));

    // the restored page waits for the backend instead of offering the attorney again
    expect(screen.queryByText(en.IntakeDashboard.attorneyRecommended)).toBeNull();
    expect(screen.queryByText(en.IntakeDashboard.viewMatchedAttorney)).toBeNull();
    expect(screen.getByText(en.IntakeDashboard.loading)).toBeInTheDocument();

    await act(async () => answer(signedCase()));
    expect(await screen.findByText(en.IntakeDashboard.attorneyConnected)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Alex");
  });
});

// The doctor's card follows the backend's provider match (lib/provider-matches.ts
// on both sides); the attorney's follows the case status alone. A live card opens
// its screen; an inert one is not a link at all and opens nothing — by pointer,
// key or script.
describe("patient dashboard team cards", () => {
  const caseWith = (lawyer: boolean, doctor: boolean, status = "qualified") => ({
    patient: { firstName: "Alex", lastName: "Rivera", mobile: "+15551230777", email: null },
    cases: [
      {
        submissionId: "s-match",
        status,
        submittedAt: "2026-08-16T00:00:00.000Z",
        locale: "en",
        treatmentArea: "San Jose, CA",
        incidentType: "car_accident",
        incidentLocation: "San Jose, CA",
        role: "driver",
        incidentDate: "2026-08-15",
        awaitingSignature: false,
        providers: { lawyer: { matched: lawyer }, doctor: { matched: doctor } },
      },
    ],
  });
  const card = (member: "attorney" | "doctor") =>
    document.querySelector(`li[data-team-member="${member}"]`) as HTMLElement;
  const inert = (li: HTMLElement) => li.querySelector("[role=link][aria-disabled=true]") as HTMLElement | null;

  beforeEach(() => {
    dashboard.get.mockReset();
    dashboard.agreementStatus.mockReset();
    nav.replace.mockReset();
    nav.push.mockReset();
    auth.getSession.mockReset().mockResolvedValue(SESSION_KEPT);
    locationAssign.mockReset();
  });

  it("opens the doctor's screen only for a doctor the backend matched, whatever the status", async () => {
    dashboard.get.mockResolvedValue(caseWith(false, true));
    const view = renderDashboard();
    await screen.findByText(en.IntakeDashboard.yourTeam);
    const doctorLink = card("doctor").querySelector("a[href]");
    expect(doctorLink).toHaveAttribute("href", "/en/intake/dashboard/doctor");
    expect(doctorLink).toHaveTextContent(PLACEHOLDER_DOCTOR.name);
    view.unmount();

    dashboard.get.mockResolvedValue(caseWith(true, false, "doctor"));
    renderDashboard();
    await screen.findByText(en.IntakeDashboard.yourTeam);
    expect(card("doctor").querySelector("a[href]")).toBeNull();
    expect(inert(card("doctor"))).toHaveAccessibleName(en.IntakeDashboard.doctorNotFound);
  });

  it("decides the attorney by the case status, never by a review link's acceptance", async () => {
    // a lawyer's acceptance on a case still in review names no one
    dashboard.get.mockResolvedValue(caseWith(true, false, "submitted"));
    const view = renderDashboard();
    await screen.findByText(en.IntakeDashboard.yourTeam);
    expect(inert(card("attorney"))).toHaveAccessibleName(en.IntakeDashboard.lawyerNotFound);
    expect(screen.queryByText(/louis berk/i)).toBeNull();
    view.unmount();

    // a signed retainer is Connected before any lawyer has accepted
    dashboard.get.mockResolvedValue(caseWith(false, false, "signed"));
    renderDashboard();
    await screen.findByText(en.IntakeDashboard.yourTeam);
    expect(within(card("attorney")).getByRole("button")).toHaveTextContent(en.IntakeDashboard.attorneyConnected);
  });

  it("an inert card cannot be opened by click, Enter, Space or focus", async () => {
    dashboard.get.mockResolvedValue(caseWith(false, false, "submitted"));
    renderDashboard();
    await screen.findByText(en.IntakeDashboard.yourTeam);

    for (const target of [inert(card("doctor"))!, inert(card("attorney"))!]) {
      fireEvent.click(target);
      fireEvent.keyDown(target, { key: "Enter" });
      fireEvent.keyDown(target, { key: " " });
      fireEvent.keyUp(target, { key: " " });
      target.focus();
      expect(document.activeElement).not.toBe(target);
      expect(target.tabIndex).toBe(-1);
      expect(target.onclick).toBeNull();
      expect(target.closest("a")).toBeNull();
      // 5366:15681: inert cards sit on #F8F8F8 with the renders in colour
      expect(target.className).toContain("bg-[#f8f8f8]");
      expect(target.querySelector("img")?.className).not.toContain("grayscale");
    }
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(locationAssign).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is in Spanish: inert cards say so in Spanish, live ones keep the locale", async () => {
    dashboard.get.mockResolvedValue(caseWith(false, true, "submitted"));
    renderDashboard("es");
    await screen.findByText(es.IntakeDashboard.yourTeam);

    expect(inert(card("attorney"))).toHaveAccessibleName(es.IntakeDashboard.lawyerNotFound);
    expect(inert(card("attorney"))).toHaveTextContent(es.IntakeDashboard.findingAttorney);
    expect(card("doctor").querySelector("a[href]")).toHaveAttribute("href", "/es/intake/dashboard/doctor");
  });
});

// The greeting across a visit to a provider screen. With cacheComponents the App
// Router does not unmount a page the patient leaves: it keeps it in an <Activity>
// that goes hidden and comes back visible, its state intact and its effects run
// again. Rendering the real page inside an Activity reproduces that lifecycle,
// which a fresh render cannot — the name was lost only on the way back.
describe("patient dashboard greeting after a provider screen", () => {
  const caseFor = (firstName: string) => ({
    patient: { firstName, lastName: "Rivera", mobile: "+15551230777", email: null },
    cases: [
      {
        submissionId: "s-greeting",
        // approved for the retainer: the attorney card opens the matched attorney
        status: "retainer_pending_signature",
        submittedAt: "2026-08-16T00:00:00.000Z",
        locale: "en",
        treatmentArea: "San Jose, CA",
        incidentType: "car_accident",
        incidentLocation: "San Jose, CA",
        role: "driver",
        incidentDate: "2026-08-15",
        awaitingSignature: true,
        providers: { lawyer: { matched: false }, doctor: { matched: false } },
      },
    ],
  });

  const renderRestorable = (locale: "en" | "es" = "en") => {
    nav.locale = locale;
    const tree = (mode: "visible" | "hidden") => (
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "es" ? es : en}
      >
        <Activity mode={mode}>
          <IntakeDashboardPage />
        </Activity>
      </NextIntlClientProvider>
    );
    const view = render(tree("visible"));
    return {
      // the patient opens the attorney card: the dashboard is kept, hidden
      leave: () => act(async () => view.rerender(tree("hidden"))),
      // and comes back to it: the same dashboard, shown again
      comeBack: () => act(async () => view.rerender(tree("visible"))),
    };
  };
  const greeting = () => screen.getByRole("heading", { level: 1 });

  beforeEach(() => {
    sessionStorage.clear();
    dashboard.get.mockReset().mockResolvedValue(caseFor("Alex"));
    dashboard.agreementStatus.mockReset();
    nav.replace.mockReset();
    nav.push.mockReset();
    auth.getSession.mockReset().mockResolvedValue(SESSION_KEPT);
  });

  it("greets a signed-in patient by the name the backend returns, with nothing in the tab", async () => {
    renderRestorable();
    await screen.findByText(en.IntakeDashboard.yourTeam);

    expect(greeting()).toHaveTextContent("Alex");
    expect(sessionStorage.getItem("intake_firstName")).toBeNull();
  });

  // Case Summary's Save returns here after the patient corrected their name or
  // the incident date; the restored dashboard must draw what the backend now
  // holds, not what it showed before they left.
  it("shows a name and incident date corrected on Case Summary when the patient comes back", async () => {
    const page = renderRestorable();
    await screen.findByText(en.IntakeDashboard.yourTeam);
    expect(greeting()).toHaveTextContent("Alex");

    await page.leave();
    const corrected = caseFor("Alexa");
    corrected.cases[0]!.incidentDate = "2026-08-14";
    dashboard.get.mockResolvedValue(corrected);
    await page.comeBack();

    await waitFor(() => expect(greeting()).toHaveTextContent("Alexa"));
    expect(screen.getByText(/8\/14\/26/)).toBeInTheDocument();
  });

  it("keeps the name after the attorney screen and back", async () => {
    const page = renderRestorable();
    await screen.findByText(en.IntakeDashboard.yourTeam);
    expect(screen.getByRole("link", { name: /louis berk/i })).toHaveAttribute("href", "/en/intake/choose-attorney");
    expect(greeting()).toHaveTextContent("Alex");

    await page.leave();
    await page.comeBack();

    // the return really re-ran the page's effect: it asked the backend again,
    // got the same case, and the greeting must still be the patient's name
    await waitFor(() => expect(dashboard.get).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(greeting()).toHaveTextContent("Alex");
    // and the case drawn is still the backend's: the firm, Recommended
    expect(screen.getByRole("link", { name: /louis berk/i })).toHaveTextContent(en.IntakeDashboard.attorneyRecommended);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("keeps it over repeated visits and the background refreshes that follow", async () => {
    const page = renderRestorable();
    await screen.findByText(en.IntakeDashboard.yourTeam);

    for (let visit = 1; visit <= 3; visit += 1) {
      await page.leave();
      await page.comeBack();
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
      });
      expect(greeting()).toHaveTextContent("Alex");
    }
    expect(dashboard.get).toHaveBeenCalledTimes(7);
  });

  it("never greets from a name an earlier intake left in the tab", async () => {
    // a different patient's intake ran in this tab before this patient signed in
    sessionStorage.setItem("intake_firstName", "Ada");
    const page = renderRestorable();
    await screen.findByText(en.IntakeDashboard.yourTeam);
    expect(greeting()).toHaveTextContent("Alex");

    await page.leave();
    await page.comeBack();
    await waitFor(() => expect(dashboard.get).toHaveBeenCalledTimes(2));
    await act(async () => {});

    expect(greeting()).toHaveTextContent("Alex");
    expect(screen.queryByText("Ada")).toBeNull();
  });

  it("keeps the name for a Spanish patient after the attorney screen and back", async () => {
    const page = renderRestorable("es");
    await screen.findByText(es.IntakeDashboard.yourTeam);
    expect(screen.getByRole("link", { name: /louis berk/i })).toHaveAttribute("href", "/es/intake/choose-attorney");

    await page.leave();
    await page.comeBack();
    await waitFor(() => expect(dashboard.get).toHaveBeenCalledTimes(2));
    await act(async () => {});

    expect(greeting()).toHaveTextContent("Alex");
  });
});

// Figma 5783:5481: View Case Summary, magenta and underlined, under the Up next
// block and above the settlement estimate, opening the patient's own case.
describe("patient dashboard View Case Summary", () => {
  const caseIn = (status: string, submissionId = "s-summary") => ({
    patient: { firstName: "Jessica", lastName: "Hale", mobile: "+15551230888", email: null },
    cases: [
      {
        submissionId,
        status,
        submittedAt: "2026-09-08T00:00:00.000Z",
        locale: "en",
        treatmentArea: "Orlando, FL",
        incidentType: "car",
        incidentLocation: "Orlando, FL",
        role: "driver",
        incidentDate: "2026-09-08",
        agreementStatus: null,
        awaitingSignature: status === "retainer_pending_signature",
        providers: { lawyer: { matched: false }, doctor: { matched: false } },
      },
    ],
  });

  beforeEach(() => {
    sessionStorage.clear();
    nav.push.mockReset();
    auth.getSession.mockReset().mockResolvedValue(SESSION_KEPT);
    dashboard.get.mockReset();
    dashboard.agreementStatus.mockReset();
  });

  const summaryLink = async () => (await screen.findByTestId("view-case-summary")) as HTMLAnchorElement;

  it("sits between Up next and the settlement estimate, in the brand magenta, underlined", async () => {
    dashboard.get.mockResolvedValue(caseIn("submitted"));
    renderDashboard();

    const link = await summaryLink();
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/en/case/s-summary");
    expect(link.className).toContain("text-[#cc007e]");
    expect(link.className).toContain("text-[16px]");
    const label = link.querySelector("span.font-semibold") as HTMLElement;
    expect(label.textContent?.trim()).toBe(en.IntakeDashboard.viewCaseSummary);
    expect(label.style.fontFamily).toBe("var(--font-nunito-sans)");
    // underlined under the whole run, trailing space included, as the frame draws it
    const rule = label.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(rule.className).toContain("inset-x-0");
    expect(rule.className).toContain("bg-current");

    const upNext = screen.getByText(en.IntakeDashboard.caseInReview);
    const estimate = screen.getByText(en.IntakeDashboard.runSimulator);
    expect(upNext.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(link.compareDocumentPosition(estimate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("is a keyboard-reachable link named View Case Summary, the arrow hidden from screen readers", async () => {
    dashboard.get.mockResolvedValue(caseIn("submitted"));
    renderDashboard();

    const link = await screen.findByRole("link", { name: en.IntakeDashboard.viewCaseSummary });
    expect(link).toBe(await summaryLink());
    expect(link.tabIndex).toBe(0);
    // the design's ↗, drawn rather than typed, and not read out
    expect(link.querySelector('svg[aria-hidden="true"] path')).not.toBeNull();
    link.focus();
    expect(document.activeElement).toBe(link);
  });

  it("opens the current patient's own case, whichever case that is", async () => {
    dashboard.get.mockResolvedValue(caseIn("submitted", "9f1c2d3e-0000-4000-8000-000000000abc"));
    renderDashboard();

    expect((await summaryLink()).getAttribute("href")).toBe("/en/case/9f1c2d3e-0000-4000-8000-000000000abc");
  });

  it("is in Spanish on the Spanish dashboard and keeps the locale", async () => {
    dashboard.get.mockResolvedValue(caseIn("submitted"));
    renderDashboard("es");

    const link = await summaryLink();
    expect(link.textContent).toContain(es.IntakeDashboard.viewCaseSummary);
    expect(link.getAttribute("href")).toBe("/es/case/s-summary");
  });

  it("stays beside an Up next that links to the matched attorney, without replacing it", async () => {
    dashboard.get.mockResolvedValue(caseIn("retainer_pending_signature"));
    renderDashboard();

    await summaryLink();
    const attorneyLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === "/en/intake/choose-attorney");
    expect(attorneyLinks.length).toBeGreaterThan(0);
  });

  it("is not drawn when there is no case", async () => {
    dashboard.get.mockResolvedValue({ patient: null, cases: [] });
    renderDashboard();

    await screen.findByText(en.IntakeDashboard.emptyTitle);
    expect(screen.queryByTestId("view-case-summary")).toBeNull();
  });
});
