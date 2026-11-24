import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";
import {
  installGooglePlacesMock,
  removeGooglePlacesMock,
  SANGAMON_COUNTY_NO_ZIP,
  SPRINGFIELD_62704,
  WINTER_GARDEN_34787,
} from "@/test-utils/google-places-mock";

// HP#128: "Where do you live?" takes a place only with its ZIP — it decides the
// closest treatment. Continue opens for a picked place or a current location
// that carries one; one without is refused with the reason on screen.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/intake/residence",
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));
// the header this page renders builds a Supabase client and watches auth state
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);
vi.mock("@/hooks/use-require-session-key", () => ({ useRequireSessionKey: () => {} }));

import IntakeResidencePage from "../page";

const renderPage = (messages: typeof en = en) =>
  render(
    <NextIntlClientProvider
      locale={messages === es ? "es" : "en"}
      messages={messages}
    >
      <IntakeResidencePage />
    </NextIntlClientProvider>
  );

const field = () => document.getElementById("residence") as HTMLInputElement;
const continueButton = () => screen.getByRole("button", { name: en.Common.continue });
const pick = async (query: string, option: RegExp) => {
  fireEvent.focus(field());
  fireEvent.change(field(), { target: { value: query } });
  fireEvent.click(await screen.findByRole("button", { name: option }));
};

describe("residence — the ZIP is required", () => {
  beforeEach(() => {
    push.mockReset();
    sessionStorage.clear();
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    removeGooglePlacesMock();
  });

  it("continues with a picked place that has a ZIP", async () => {
    installGooglePlacesMock({ suggestions: [SPRINGFIELD_62704] });
    renderPage();
    expect(continueButton()).toBeDisabled();

    await pick("Spring", /Springfield, IL/);

    await waitFor(() => expect(continueButton()).toBeEnabled());
    fireEvent.click(continueButton());
    expect(sessionStorage.getItem("intake_residence")).toBe("Springfield, IL 62704");
    expect(push).toHaveBeenCalledWith("/en/intake/treatment-area");
  });

  it("refuses a picked place without a ZIP, and says why", async () => {
    installGooglePlacesMock({ suggestions: [SANGAMON_COUNTY_NO_ZIP] });
    renderPage();

    await pick("Sangamon", /Sangamon County/);

    expect(await screen.findByText(en.IntakeResidence.zipRequired)).toBeInTheDocument();
    await waitFor(() => expect(continueButton()).toBeDisabled());
  });

  it("continues with a current location that has a ZIP", async () => {
    installGooglePlacesMock({ suggestions: [], currentLocation: WINTER_GARDEN_34787 });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: en.IntakeResidence.useCurrentLocation }));

    await waitFor(() => expect(field()).toHaveValue("Winter Garden, FL 34787"));
    await waitFor(() => expect(continueButton()).toBeEnabled());
  });

  it("refuses a current location without a ZIP", async () => {
    installGooglePlacesMock({ suggestions: [], currentLocation: SANGAMON_COUNTY_NO_ZIP });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: en.IntakeResidence.useCurrentLocation }));

    expect(await screen.findByText(en.IntakeResidence.zipRequired)).toBeInTheDocument();
    await waitFor(() => expect(continueButton()).toBeDisabled());
  });

  it("gives the reason in Spanish", async () => {
    installGooglePlacesMock({ suggestions: [SANGAMON_COUNTY_NO_ZIP] });
    renderPage(es);

    await pick("Sangamon", /Sangamon County/);

    expect(await screen.findByText(es.IntakeResidence.zipRequired)).toBeInTheDocument();
  });
});
