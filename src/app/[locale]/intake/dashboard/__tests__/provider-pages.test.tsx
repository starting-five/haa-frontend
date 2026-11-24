import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";

// The attorney and doctor screens. They render the real pages: the attorney's
// opens only once the case's retainer is signed (lib/attorney-stage.ts) and the
// doctor's only when the backend reports a doctor matched; an address typed or
// kept from earlier, a provider who is not the patient's or an unreadable case
// all go back to the dashboard without the provider ever being drawn.

const nav = vi.hoisted(() => ({ locale: "en", replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => `/${nav.locale}/intake/dashboard/attorney`,
  useRouter: () => ({ replace: nav.replace, push: nav.push, prefetch: vi.fn() }),
  useParams: () => ({ locale: nav.locale }),
}));

const dashboard = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/services/intake", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/intake")>();
  return { ...actual, getPatientDashboard: dashboard.get };
});

vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);

import { PatientDashboardUnavailableError } from "@/services/intake";
import AttorneyPage from "../attorney/page";
import DoctorPage from "../doctor/page";

// `attorney`: the retainer signed (the attorney connected) or still waiting for
// the signature (only recommended). `doctor`: the backend's doctor match.
const caseWith = (attorney: boolean, doctor: boolean) => ({
  patient: { firstName: "Alex", lastName: "Rivera", mobile: "+15551230777", email: null },
  cases: [
    {
      submissionId: "s-1",
      status: attorney ? "signed" : "retainer_pending_signature",
      submittedAt: "2026-08-16T00:00:00.000Z",
      locale: "en",
      incidentType: "car",
      incidentLocation: "Tampa, FL",
      providers: { lawyer: { matched: attorney }, doctor: { matched: doctor } },
    },
  ],
});

const renderPage = (Page: () => React.ReactNode, locale: "en" | "es" = "en") => {
  nav.locale = locale;
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "es" ? es : en}
    >
      <Page />
    </NextIntlClientProvider>
  );
};

beforeEach(() => {
  dashboard.get.mockReset();
  nav.replace.mockReset();
  nav.push.mockReset();
});

afterEach(() => {
  nav.locale = "en";
});

describe("attorney screen", () => {
  it("opens once the retainer is signed, with the firm", async () => {
    dashboard.get.mockResolvedValue(caseWith(true, false));
    renderPage(AttorneyPage);

    expect(await screen.findByText("Louis Berk Injury & Trial Attorneys")).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("sends a case still waiting for its signature back to the dashboard, never drawing the firm", async () => {
    dashboard.get.mockResolvedValue(caseWith(false, true));
    renderPage(AttorneyPage);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/intake/dashboard"));
    expect(screen.queryByText(/louis berk/i)).toBeNull();
  });

  it("goes back when there is no case, and when the dashboard cannot be read", async () => {
    dashboard.get.mockRejectedValue(new PatientDashboardUnavailableError("intake_incomplete"));
    const first = renderPage(AttorneyPage);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/intake/dashboard"));
    first.unmount();

    nav.replace.mockReset();
    dashboard.get.mockRejectedValue(new Error("network"));
    renderPage(AttorneyPage);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/intake/dashboard"));
    expect(screen.queryByText(/louis berk/i)).toBeNull();
  });

  it("does not open for a case in review, even with a lawyer's acceptance on it", async () => {
    const inReview = caseWith(false, false);
    inReview.cases[0].status = "submitted";
    inReview.cases[0].providers.lawyer.matched = true;
    dashboard.get.mockResolvedValue(inReview);
    renderPage(AttorneyPage);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/intake/dashboard"));
    expect(screen.queryByText(/louis berk/i)).toBeNull();
  });

  it("keeps the Spanish dashboard when it sends a Spanish patient back", async () => {
    dashboard.get.mockResolvedValue(caseWith(false, false));
    renderPage(AttorneyPage, "es");

    expect(screen.getByText(es.IntakeDashboard.loading)).toBeInTheDocument();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/es/intake/dashboard"));
  });
});

describe("doctor screen", () => {
  it("opens for a matched doctor", async () => {
    dashboard.get.mockResolvedValue(caseWith(false, true));
    renderPage(DoctorPage);

    expect(await screen.findByText("Bay Area Injury & Rehabilitation")).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("does not open because the attorney is connected", async () => {
    dashboard.get.mockResolvedValue(caseWith(true, false));
    renderPage(DoctorPage);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/intake/dashboard"));
    expect(screen.queryByText(/bay area injury/i)).toBeNull();
  });

  it("reads a backend without the providers block as no doctor", async () => {
    const legacy = caseWith(true, true);
    delete (legacy.cases[0] as { providers?: unknown }).providers;
    dashboard.get.mockResolvedValue(legacy);
    renderPage(DoctorPage);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/intake/dashboard"));
  });
});
