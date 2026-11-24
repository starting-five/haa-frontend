import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { SPLASH_DURATION_MS } from "@/lib/constants";
import type { EmbeddedSigningOptions } from "@/lib/docusign-embed";
import en from "../../../../../messages/en.json";

// The retainer's place in the patient's case, across the real screens:
//
//   submit -> ready -> dashboard (Case in review)          no DocuSign at all
//   admin approves -> dashboard (View matched attorney, the firm Recommended)
//     -> Choose Attorney -> Hire Your Attorney -> agreement -> DocuSign
//     -> backend says completed -> dashboard (Attorney will contact you,
//        the firm Connected), with no second signing
//
// Only the backend and DocuSign's library are replaced. Each screen is
// rendered in turn with the answers the backend gives at that point.

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/intake/dashboard",
  useRouter: () => ({ push: nav.push, replace: nav.replace, prefetch: nav.prefetch }),
  useParams: () => ({ locale: "en" }),
}));
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);
vi.mock("@/hooks/use-preload-images", () => ({ usePreloadImages: () => {} }));

const backend = vi.hoisted(() => ({
  completeIntake: vi.fn(),
  getPatientDashboard: vi.fn(),
  getAgreementStatus: vi.fn(),
  createAgreement: vi.fn(),
}));
vi.mock("@/services/intake", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/intake")>();
  return { ...actual, ...backend };
});

const signing = vi.hoisted(() => ({ mounted: [] as EmbeddedSigningOptions[], start: vi.fn() }));
vi.mock("@/lib/docusign-embed", () => ({
  startEmbeddedSigning: async (options: EmbeddedSigningOptions) => {
    signing.start(options);
    signing.mounted.push(options);
    return { destroy: vi.fn() };
  },
}));

import { PLACEHOLDER_ATTORNEY } from "@/lib/providers";
import AgreementPage from "../agreement/page";
import ChooseAttorneyPage from "../choose-attorney/page";
import DashboardPage from "../dashboard/page";
import HireAttorneyPage from "../hire-attorney/page";
import ReadyPage from "../ready/page";
import ReviewPage from "../review/page";

const SUBMISSION_ID = "0f4c2b9e-4d7e-4f0b-9a57-2f7f1f0e2c11";

const dashboardWith = (overrides: Record<string, unknown>) => ({
  patient: { firstName: "Alex", lastName: "Rivera", mobile: "+15551230777", email: null },
  cases: [
    {
      submissionId: SUBMISSION_ID,
      status: "submitted",
      submittedAt: "2026-09-30T00:00:00.000Z",
      locale: "en",
      treatmentArea: "San Jose, CA",
      incidentType: "car_accident",
      incidentLocation: "San Jose, CA",
      role: "driver",
      incidentDate: "2026-09-29",
      agreementStatus: null,
      awaitingSignature: false,
      ...overrides,
    },
  ],
});

const show = (screenElement: ReactElement) =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={en}
    >
      {screenElement}
    </NextIntlClientProvider>
  );

const nothingAskedOfDocusign = () => {
  expect(backend.createAgreement).not.toHaveBeenCalled();
  expect(signing.start).not.toHaveBeenCalled();
};

describe("the retainer in the patient's case", () => {
  beforeEach(() => {
    nav.push.mockReset();
    nav.replace.mockReset();
    nav.prefetch.mockReset();
    for (const call of Object.values(backend)) call.mockReset();
    signing.start.mockReset();
    signing.mounted = [];
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("submitting goes to the dashboard's Case in review, and DocuSign is never asked", async () => {
    // What the flow holds at the review screen.
    sessionStorage.setItem("intake_submissionId", SUBMISSION_ID);
    sessionStorage.setItem("intake_firstName", "Alex");
    sessionStorage.setItem("intake_treatmentArea", "San Jose, CA");
    backend.completeIntake.mockResolvedValue(undefined);

    const review = show(<ReviewPage />);
    fireEvent.click(screen.getByRole("button", { name: en.IntakeReview.submit }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/intake/ready"));
    expect(backend.completeIntake).toHaveBeenCalledTimes(1);
    review.unmount();
    nothingAskedOfDocusign();

    vi.useFakeTimers();
    const ready = show(<ReadyPage />);
    act(() => {
      vi.advanceTimersByTime(SPLASH_DURATION_MS);
    });
    expect(nav.replace).toHaveBeenCalledWith("/en/intake/dashboard");
    expect(nav.replace).not.toHaveBeenCalledWith("/en/intake/agreement");
    expect(nav.replace).not.toHaveBeenCalledWith("/en/intake/hire-attorney");
    ready.unmount();
    vi.useRealTimers();
    nav.replace.mockReset();

    backend.getPatientDashboard.mockResolvedValue(dashboardWith({ status: "submitted" }));
    show(<DashboardPage />);
    expect(await screen.findByText(en.IntakeDashboard.caseInReview)).toBeInTheDocument();
    expect(screen.getByText(en.IntakeDashboard.upNext)).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
    nothingAskedOfDocusign();
    expect(backend.getAgreementStatus).not.toHaveBeenCalled();
  });

  it("an approved case is chosen, signed in DocuSign and Connected once the backend says so", async () => {
    // A patient who signed in again: the tab holds nothing of the case.
    backend.getPatientDashboard.mockResolvedValue(
      dashboardWith({ status: "retainer_pending_signature", awaitingSignature: true })
    );

    // The dashboard offers the matched attorney and opens nothing by itself.
    const dashboard = show(<DashboardPage />);
    const viewMatched = await screen.findByRole("link", {
      name: new RegExp(en.IntakeDashboard.viewMatchedAttorney, "i"),
    });
    expect(viewMatched).toHaveAttribute("href", "/en/intake/choose-attorney");
    const recommended = screen.getByRole("link", { name: new RegExp(en.IntakeDashboard.attorneyRecommended) });
    expect(recommended).toHaveAttribute("href", "/en/intake/choose-attorney");
    expect(recommended).toHaveTextContent(PLACEHOLDER_ATTORNEY.name);
    expect(nav.replace).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
    dashboard.unmount();
    nothingAskedOfDocusign();

    const choose = show(<ChooseAttorneyPage />);
    expect(
      await screen.findByRole("button", {
        name: `${en.IntakeChooseAttorney.chooseOwn} ${en.IntakeChooseAttorney.comingSoon}`,
      })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: en.IntakeChooseAttorney.continue }));
    expect(nav.push).toHaveBeenCalledWith("/en/intake/hire-attorney");
    choose.unmount();
    nothingAskedOfDocusign();

    const hire = show(<HireAttorneyPage />);
    fireEvent.click(await screen.findByRole("button", { name: en.IntakeHireAttorney.signAgreement }));
    expect(nav.push).toHaveBeenCalledWith("/en/intake/agreement");
    hire.unmount();
    nothingAskedOfDocusign();

    backend.createAgreement.mockResolvedValue({
      ok: true,
      status: "sent",
      signingUrl: "https://demo.docusign.net/Signing/MTRedeem/v1/lifecycle",
      embed: { scriptUrl: "https://js-d.docusign.com/bundle.js", integrationKey: "integration-key-under-test" },
    });
    // DocuSign ends the session before the backend has caught up once.
    backend.getAgreementStatus.mockResolvedValueOnce({ ok: true, status: "sent" });
    backend.getAgreementStatus.mockResolvedValue({ ok: true, status: "completed" });

    const agreement = show(<AgreementPage />);
    await waitFor(() => expect(signing.start).toHaveBeenCalledTimes(1));
    // The backend's case, carried by the dashboard, is what is signed.
    expect(backend.createAgreement).toHaveBeenCalledTimes(1);
    expect(backend.createAgreement).toHaveBeenCalledWith(SUBMISSION_ID, "en");
    // The browser receives a signing URL and a public integration key — no
    // account, template, envelope or key material.
    expect(Object.keys(signing.mounted[0]!).sort()).toEqual(
      ["container", "integrationKey", "onReady", "onSessionEnd", "scriptUrl", "signingUrl"].sort()
    );
    expect(nav.replace).not.toHaveBeenCalledWith("/en/intake/dashboard");

    await act(async () => {
      signing.mounted[0]!.onSessionEnd({ sessionEndType: "signing_complete" });
    });
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/intake/dashboard"));
    expect(backend.getAgreementStatus).toHaveBeenCalledWith(SUBMISSION_ID);
    agreement.unmount();

    // Signed: the dashboard shows the attorney Connected and offers no second signing.
    nav.replace.mockReset();
    backend.getPatientDashboard.mockResolvedValue(
      dashboardWith({ status: "signed", agreementStatus: "completed", awaitingSignature: false })
    );
    show(<DashboardPage />);
    expect(await screen.findByText(en.IntakeDashboard.attorneyWillContact)).toBeInTheDocument();
    const connected = screen.getByRole("button", { name: new RegExp(en.IntakeDashboard.attorneyConnected) });
    expect(document.querySelector("a[href*='choose-attorney']")).toBeNull();
    expect(document.querySelector('ol > li[aria-current="step"]')).toHaveTextContent(
      en.IntakeDashboard.stepAttorneyCall
    );

    fireEvent.click(connected);
    const actions = await screen.findByRole("dialog", { name: en.ProviderScreen.attorneyDetails });
    expect(within(actions).getByRole("button", { name: en.ProviderScreen.groupChat })).toBeDisabled();
    expect(within(actions).getByRole("button", { name: en.ProviderScreen.changeAttorney })).toBeDisabled();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(backend.createAgreement).toHaveBeenCalledTimes(1);
  });
});
