import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en.json";
import {
  installGooglePlacesMock,
  removeGooglePlacesMock,
  SANGAMON_COUNTY_NO_ZIP,
  SPRINGFIELD_62704,
  WINTER_GARDEN_34787,
} from "@/test-utils/google-places-mock";

// "Submit My Case" must submit through the real backend and only advance to the
// post-submit transition once the backend confirms. A failed submit must keep
// the patient on Review (never falling through to the attorney flow), and the
// double-submit guard must keep it to a single backend call and a single
// navigation.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/intake/review",
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));
// the header this page renders builds a Supabase client and watches auth state
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);

vi.mock("@/hooks/use-require-session-key", () => ({ useRequireSessionKey: () => {} }));
vi.mock("@/hooks/use-preload-images", () => ({ usePreloadImages: () => {} }));

const completeIntake = vi.fn();
vi.mock("@/services/intake", () => ({
  completeIntake: (...args: unknown[]) => completeIntake(...args),
}));

const clearIntakeSessionAfterSubmit = vi.fn();
vi.mock("@/lib/intake-session", () => ({
  clearIntakeSessionAfterSubmit: (...args: unknown[]) => clearIntakeSessionAfterSubmit(...args),
}));

import IntakeReviewPage from "../page";

const renderPage = () =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
    >
      <IntakeReviewPage />
    </NextIntlClientProvider>
  );

const clickSubmit = () => fireEvent.click(screen.getByRole("button", { name: messages.IntakeReview.submit }));

describe("review (Submit My Case)", () => {
  beforeEach(() => {
    push.mockReset();
    completeIntake.mockReset();
    clearIntakeSessionAfterSubmit.mockReset();
    sessionStorage.clear();
  });

  it("submits through the backend and only then advances to the transition", async () => {
    completeIntake.mockResolvedValueOnce(undefined);
    renderPage();

    clickSubmit();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/intake/ready"));
    expect(push).toHaveBeenCalledTimes(1);
    expect(completeIntake).toHaveBeenCalledTimes(1);
    expect(clearIntakeSessionAfterSubmit).toHaveBeenCalledTimes(1);
  });

  it("forwards the stored location details to completeIntake (F1 end-to-end payload)", async () => {
    sessionStorage.setItem(
      "intake_incidentLocationDetails",
      JSON.stringify({
        text: "1 Accident Rd, Los Angeles, CA 90001",
        city: "Los Angeles",
        state: "CA",
        postalCode: "90001",
        latitude: 34,
        longitude: -118,
        source: "autosuggest",
        precision: "address",
      })
    );
    sessionStorage.setItem(
      "intake_residenceLocationDetails",
      JSON.stringify({
        text: "500 Home Ave, Los Angeles, CA",
        city: "Los Angeles",
        state: "CA",
        source: "autosuggest",
        precision: "address",
      })
    );
    sessionStorage.setItem(
      "intake_treatmentAreaLocationDetails",
      JSON.stringify({ text: "Clinic, Los Angeles, CA", source: "manual", precision: "unvalidated" })
    );
    completeIntake.mockResolvedValueOnce(undefined);
    renderPage();

    clickSubmit();

    await waitFor(() => expect(completeIntake).toHaveBeenCalledTimes(1));
    const payload = completeIntake.mock.calls[0][0] as {
      claimant: { residenceLocationDetails?: unknown };
      accident: { incidentLocationDetails?: unknown };
      treatmentAreaLocationDetails?: unknown;
    };
    expect(payload.claimant.residenceLocationDetails).toMatchObject({ city: "Los Angeles", source: "autosuggest" });
    expect(payload.accident.incidentLocationDetails).toMatchObject({
      state: "CA",
      postalCode: "90001",
      source: "autosuggest",
    });
    expect(payload.treatmentAreaLocationDetails).toMatchObject({ source: "manual", precision: "unvalidated" });
  });

  it("submits stored companions when a companion has no last name", async () => {
    sessionStorage.setItem(
      "intake_who_was_with_you_people",
      JSON.stringify([
        {
          firstName: "Mike",
          lastName: "",
          relation: "passenger",
          cellNumber: "(415) 555-2233",
          email: "",
        },
      ])
    );
    completeIntake.mockResolvedValueOnce(undefined);
    renderPage();

    clickSubmit();

    await waitFor(() => expect(completeIntake).toHaveBeenCalledTimes(1));
    const payload = completeIntake.mock.calls[0][0] as {
      companions?: Array<{
        firstName: string;
        lastName: string;
        relation: string;
        cellNumber: string;
        email?: string;
      }>;
    };
    expect(payload.companions).toHaveLength(1);
    expect(payload.companions?.[0]).toMatchObject({
      firstName: "Mike",
      lastName: "",
      relation: "passenger",
      cellNumber: "(415) 555-2233",
    });
    expect(payload.companions?.[0].email).toBeUndefined();
  });

  it("stays on Review and shows an error when the backend submit fails, then allows a retry", async () => {
    // the backend's own error message is surfaced when present, else a generic one
    completeIntake.mockRejectedValueOnce(new Error("We couldn't reach the server"));
    renderPage();

    clickSubmit();

    await screen.findByText("We couldn't reach the server");
    expect(push).not.toHaveBeenCalled();
    expect(clearIntakeSessionAfterSubmit).not.toHaveBeenCalled();

    // the guard resets on failure so the patient can submit again
    completeIntake.mockResolvedValueOnce(undefined);
    clickSubmit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/intake/ready"));
    expect(completeIntake).toHaveBeenCalledTimes(2);
  });

  it("disables the control while submitting, so the case is submitted and navigated once", async () => {
    let resolveSubmit: (() => void) | undefined;
    completeIntake.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        })
    );
    renderPage();

    clickSubmit();

    // while the backend call is in flight the control stays disabled,
    // so a second tap cannot fire another submission or navigation
    const busy = await screen.findByRole("button", { name: messages.IntakeReview.submit });
    expect(busy).toBeDisabled();

    resolveSubmit?.();
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(completeIntake).toHaveBeenCalledTimes(1);
  });

  it("keeps recovery location editable without requiring a ZIP code", async () => {
    sessionStorage.setItem("intake_treatmentArea", "Los Angeles, CA 90024");

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: messages.IntakeReview.recoveryTitle }));

    const save = await screen.findByRole("button", { name: messages.IntakeReview.saveChanges });
    expect(save).toBeEnabled();

    fireEvent.change(screen.getByDisplayValue("Los Angeles, CA 90024"), {
      target: { value: "Los Angeles, CA" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: messages.IntakeReview.saveChanges })).toBeEnabled();
    });
  });
});

// The summary's accident editor uses the incident screen's own field: a place
// Google resolved — picked, or found by "Use current location" — is valid, and
// unresolved typing is not. Save follows what the field reports. "Use current
// location" on a saved place once left Save disabled for good: the page cleared
// its flag on every change, and the field, already valid, never said so again.
describe("review — the accident editor's location", () => {
  const SAVED = "Springfield, IL 62704";
  const savedDetails = {
    text: SAVED,
    placeId: SPRINGFIELD_62704.id,
    city: "Springfield",
    state: "IL",
    postalCode: "62704",
    source: "autosuggest",
    precision: "address",
  };

  const seedAccident = ({ details = true }: { details?: boolean } = {}) => {
    sessionStorage.setItem("intake_incidentType", "car");
    sessionStorage.setItem("intake_incidentDate", "2026-01-10");
    sessionStorage.setItem("intake_role", "driver");
    sessionStorage.setItem("intake_incidentLocation", SAVED);
    if (details) sessionStorage.setItem("intake_incidentLocationDetails", JSON.stringify(savedDetails));
  };
  const openEditor = () => fireEvent.click(screen.getByRole("button", { name: messages.IntakeReview.accidentTitle }));
  const save = () => screen.getByRole("button", { name: messages.IntakeReview.saveChanges });
  const field = () => document.getElementById("review-accident-location") as HTMLInputElement;
  const useCurrentLocation = () =>
    fireEvent.click(screen.getByRole("button", { name: messages.IntakeLocation.useCurrentLocation }));
  const typeLocation = (text: string) => {
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: text } });
  };

  beforeEach(() => {
    push.mockReset();
    sessionStorage.clear();
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    removeGooglePlacesMock();
  });

  it("opens with the saved place and Save enabled", () => {
    installGooglePlacesMock({ suggestions: [SPRINGFIELD_62704] });
    seedAccident();
    renderPage();
    openEditor();

    expect(field()).toHaveValue(SAVED);
    expect(save()).toBeEnabled();
  });

  it("enables Save once 'Use current location' fills the field, and saves that place", async () => {
    installGooglePlacesMock({ suggestions: [], currentLocation: WINTER_GARDEN_34787 });
    seedAccident();
    renderPage();
    openEditor();

    useCurrentLocation();

    await waitFor(() => expect(field()).toHaveValue("Winter Garden, FL 34787"));
    expect(save()).toBeEnabled();

    fireEvent.click(save());
    expect(sessionStorage.getItem("intake_incidentLocation")).toBe("Winter Garden, FL 34787");
    expect(JSON.parse(sessionStorage.getItem("intake_incidentLocationDetails") ?? "{}")).toMatchObject({
      source: "current_location",
      postalCode: "34787",
    });
  });

  it("enables Save when the current location resolves a place the editor opened unable to vouch for", async () => {
    // the text came back without the details the incident screen keeps beside it
    installGooglePlacesMock({ suggestions: [], currentLocation: WINTER_GARDEN_34787 });
    seedAccident({ details: false });
    renderPage();
    openEditor();
    expect(save()).toBeDisabled();

    useCurrentLocation();

    await waitFor(() => expect(field()).toHaveValue("Winter Garden, FL 34787"));
    await waitFor(() => expect(save()).toBeEnabled());
  });

  it("accepts a current location without a ZIP, as the incident screen does", async () => {
    installGooglePlacesMock({ suggestions: [], currentLocation: SANGAMON_COUNTY_NO_ZIP });
    seedAccident();
    renderPage();
    openEditor();

    useCurrentLocation();

    await waitFor(() => expect(field()).not.toHaveValue(SAVED));
    expect(save()).toBeEnabled();
    expect(screen.queryByText(messages.IntakeResidence.zipRequired)).not.toBeInTheDocument();
  });

  it("keeps Save disabled while the location is typed and not yet resolved", async () => {
    installGooglePlacesMock({ suggestions: [SPRINGFIELD_62704] });
    seedAccident();
    renderPage();
    openEditor();

    typeLocation("Springf");

    await waitFor(() => expect(save()).toBeDisabled());
  });

  it("enables Save when a suggestion is picked", async () => {
    installGooglePlacesMock({ suggestions: [WINTER_GARDEN_34787] });
    seedAccident();
    renderPage();
    openEditor();

    typeLocation("Winter");
    await waitFor(() => expect(save()).toBeDisabled());
    fireEvent.click(await screen.findByRole("button", { name: /Winter Garden, FL/ }));

    await waitFor(() => expect(save()).toBeEnabled());
  });

  it("reopens a saved edit with that place and Save still enabled", async () => {
    installGooglePlacesMock({ suggestions: [WINTER_GARDEN_34787] });
    seedAccident();
    renderPage();
    openEditor();
    typeLocation("Winter");
    fireEvent.click(await screen.findByRole("button", { name: /Winter Garden, FL/ }));
    await waitFor(() => expect(save()).toBeEnabled());
    const picked = field().value;

    fireEvent.click(save());
    await waitFor(() => expect(screen.queryByRole("button", { name: messages.IntakeReview.saveChanges })).toBeNull());
    expect(screen.getByText(picked)).toBeInTheDocument(); // the summary shows the new place

    openEditor();
    expect(field()).toHaveValue(picked);
    expect(save()).toBeEnabled();
  });
});

// The Review sheets are shared with Case Summary (components/case-summary/).
// On Review they still edit the intake in this tab and nothing else: no
// backend call, no locked contact rows, the same sessionStorage keys.
describe("review — the shared edit sheets keep Review's behaviour", () => {
  beforeEach(() => {
    push.mockReset();
    completeIntake.mockReset();
    sessionStorage.clear();
    sessionStorage.setItem("intake_firstName", "Ada");
    sessionStorage.setItem("intake_lastName", "Byron");
    sessionStorage.setItem("intake_phone", "+15550001111");
    sessionStorage.setItem("intake_email", "ada@example.test");
    sessionStorage.setItem("intake_injuries", JSON.stringify({ selected: ["back"] }));
  });

  it("edits the name in the tab, with no phone or email fields in the sheet", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: messages.IntakeReview.aboutTitle }));

    expect(screen.queryByLabelText(messages.CaseSummary.phoneLabel)).toBeNull();
    expect(screen.queryByLabelText(messages.CaseSummary.emailLabel)).toBeNull();
    fireEvent.change(document.getElementById("review-first-name") as HTMLInputElement, {
      target: { value: "  Augusta " },
    });
    fireEvent.click(screen.getByRole("button", { name: messages.IntakeReview.saveChanges }));

    expect(sessionStorage.getItem("intake_firstName")).toBe("Augusta");
    expect(sessionStorage.getItem("intake_lastName")).toBe("Byron");
    expect(sessionStorage.getItem("intake_phone")).toBe("+15550001111");
    expect(await screen.findByText("Augusta Byron")).toBeInTheDocument();
    expect(completeIntake).not.toHaveBeenCalled();
  });

  it("keeps Save disabled for an empty name, as before", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: messages.IntakeReview.aboutTitle }));
    fireEvent.change(document.getElementById("review-last-name") as HTMLInputElement, { target: { value: " " } });

    expect(screen.getByRole("button", { name: messages.IntakeReview.saveChanges })).toBeDisabled();
  });

  it("edits the injuries in the tab", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: messages.IntakeReview.injuriesTitle }));
    fireEvent.click(screen.getByRole("button", { name: messages.IntakeInjury.headNeck }));
    fireEvent.click(screen.getByRole("button", { name: messages.IntakeReview.saveChanges }));

    expect(JSON.parse(sessionStorage.getItem("intake_injuries") ?? "{}")).toEqual({ selected: ["back", "headNeck"] });
    expect(completeIntake).not.toHaveBeenCalled();
  });

  it("closes a sheet on Cancel without writing anything", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: messages.IntakeReview.aboutTitle }));
    fireEvent.change(document.getElementById("review-first-name") as HTMLInputElement, { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: messages.IntakeReview.cancel }));

    expect(sessionStorage.getItem("intake_firstName")).toBe("Ada");
    expect(document.getElementById("review-first-name")).toBeNull();
  });
});
