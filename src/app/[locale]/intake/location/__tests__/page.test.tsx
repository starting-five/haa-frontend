import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";

// The accident reaches the case from here.
//
// The case itself is opened when the number is verified, before the patient has
// said anything about the crash. This is the last of the accident answers, so
// this screen carries them — and the location details captured with them — onto
// the submission that already exists.

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/intake/location",
}));
vi.mock("@/hooks/use-require-session-key", () => ({ useRequireSessionKey: () => {} }));
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);
vi.mock("next/image", () => ({ default: () => <span data-testid="next-image" /> }));

const startIntake = vi.fn();
vi.mock("@/services/intake", () => ({ startIntake: (...a: unknown[]) => startIntake(...a) }));

// The real input loads Google Maps; the flow only needs a value and a verdict.
vi.mock("@/components/location-input", () => ({
  LocationInput: ({
    value,
    onChange,
    onValidityChange,
    onLocationDetailsChange,
    error,
  }: {
    value: string;
    onChange: (v: string) => void;
    onValidityChange: (valid: boolean) => void;
    onLocationDetailsChange: (d: unknown) => void;
    error?: string;
  }) => (
    <div>
      <input
        aria-label="location"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => onValidityChange(true)}
      >
        confirm
      </button>
      <button
        type="button"
        onClick={() =>
          onLocationDetailsChange({
            text: "1 Accident Rd, Los Angeles, CA 90001",
            city: "Los Angeles",
            state: "CA",
            source: "autosuggest",
            precision: "address",
          })
        }
      >
        details
      </button>
      <span data-testid="field-error">{error ?? ""}</span>
    </div>
  ),
}));

import IntakeLocationPage from "../page";

const page = (messages: typeof en | typeof es = en, locale = "en") => (
  <NextIntlClientProvider
    locale={locale}
    messages={messages}
  >
    <IntakeLocationPage />
  </NextIntlClientProvider>
);

const renderPage = (messages: typeof en | typeof es = en, locale = "en") => render(page(messages, locale));

const enterLocation = (value = "1 Accident Rd, Los Angeles, CA 90001") => {
  fireEvent.change(screen.getByLabelText("location"), { target: { value } });
  fireEvent.click(screen.getByText("confirm"));
  fireEvent.click(screen.getByText("details"));
};

const submit = () => fireEvent.click(screen.getByRole("button", { name: en.Common.continue }));

describe("the accident reaches the case from the location screen", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    startIntake.mockReset();
    startIntake.mockResolvedValue({ existing: false, submissionId: "sub-1" });
    sessionStorage.clear();
    sessionStorage.setItem("intake_firstName", "Reva");
    sessionStorage.setItem("intake_lastName", "Lin");
    sessionStorage.setItem("intake_phone", "+14075551234");
    sessionStorage.setItem("intake_incidentType", "car");
    sessionStorage.setItem("intake_incidentDate", "2026-09-18");
    sessionStorage.setItem("intake_submissionId", "sub-1");
  });

  it("sends the accident, and the location details captured with it", async () => {
    renderPage();
    enterLocation();
    submit();

    await waitFor(() => expect(startIntake).toHaveBeenCalledTimes(1));
    const payload = startIntake.mock.calls[0][0] as {
      accident: {
        incidentType: string;
        incidentDate: string;
        incidentLocation: string;
        incidentLocationDetails?: unknown;
      };
    };
    expect(payload.accident.incidentType).toBe("car");
    expect(payload.accident.incidentDate).toBe("2026-09-18");
    expect(payload.accident.incidentLocation).toBe("1 Accident Rd, Los Angeles, CA 90001");
    expect(payload.accident.incidentLocationDetails).toMatchObject({
      city: "Los Angeles",
      state: "CA",
      source: "autosuggest",
    });
  });

  it("stores the location and moves on only once the case has taken it", async () => {
    renderPage();
    enterLocation();
    submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/intake/reassurance"));
    expect(sessionStorage.getItem("intake_incidentLocation")).toBe("1 Accident Rd, Los Angeles, CA 90001");
  });

  it("keeps the patient here, with their answer, when the call fails", async () => {
    startIntake.mockRejectedValue(new Error("Request failed with status 503"));
    renderPage();
    enterLocation();
    submit();

    await waitFor(() => expect(screen.getByText(en.SubmitError.description)).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
    // The answer survives, so Continue can simply be pressed again.
    expect(sessionStorage.getItem("intake_incidentLocation")).toBe("1 Accident Rd, Los Angeles, CA 90001");
    expect(screen.getByLabelText("location")).toHaveValue("1 Accident Rd, Los Angeles, CA 90001");
  });

  it("cannot be pressed twice into a second call", async () => {
    let release: (value: unknown) => void = () => {};
    startIntake.mockReturnValue(new Promise((resolve) => (release = resolve)));
    renderPage();
    enterLocation();
    submit();

    // While the call is out the control stays disabled, which is what stops a
    // second case being opened.
    const footer = screen.getByRole("button", { name: en.Common.continue });
    expect(footer).toBeDisabled();
    fireEvent.click(footer);
    expect(startIntake).toHaveBeenCalledTimes(1);

    release({ existing: false, submissionId: "sub-1" });
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(startIntake).toHaveBeenCalledTimes(1);
  });

  it("takes a patient whose case was submitted meanwhile to their dashboard", async () => {
    startIntake.mockResolvedValue({ existing: true });
    renderPage();
    enterLocation();
    submit();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/intake/dashboard"));
    expect(push).not.toHaveBeenCalled();
  });

  it("follows the case the backend wrote to", async () => {
    startIntake.mockResolvedValue({ existing: false, submissionId: "sub-2" });
    renderPage();
    enterLocation();
    submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/intake/reassurance"));
    expect(sessionStorage.getItem("intake_submissionId")).toBe("sub-2");
  });

  // The crash type is asked for again rather than sent as "other": a case
  // cannot tell an invented answer from a real one.
  it("never sends an invented crash type", async () => {
    sessionStorage.removeItem("intake_incidentType");
    renderPage();
    enterLocation();
    submit();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/intake/incident"));
    expect(startIntake).not.toHaveBeenCalled();
  });

  it("shows the saved location when the patient comes back", async () => {
    sessionStorage.setItem("intake_incidentLocation", "Austin, TX");
    sessionStorage.setItem("intake_incidentLocationDetails", JSON.stringify({ text: "Austin, TX" }));
    renderPage();

    expect(await screen.findByLabelText("location")).toHaveValue("Austin, TX");
    submit();
    await waitFor(() => expect(startIntake).toHaveBeenCalledTimes(1));
  });

  // The server has no sessionStorage. Reading it during render drew an empty field
  // there and a filled one in the browser, and React threw the page away with a
  // hydration error — the red overlay seen on a reload of this screen.
  it("draws the same first frame whether or not a location was saved", () => {
    const withoutSaved = renderToString(page());
    sessionStorage.setItem("intake_incidentLocation", "Austin, TX");
    sessionStorage.setItem("intake_incidentLocationDetails", JSON.stringify({ text: "Austin, TX" }));
    const withSaved = renderToString(page());

    expect(withSaved).toBe(withoutSaved);
  });

  it("refuses to continue without a confirmed location", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("location"), { target: { value: "somewhere" } });
    submit();

    expect(startIntake).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("says the same things in Spanish", async () => {
    startIntake.mockRejectedValue(new Error("boom"));
    renderPage(es, "es");
    fireEvent.change(screen.getByLabelText("location"), { target: { value: "Calle 1, Los Angeles" } });
    fireEvent.click(screen.getByText("confirm"));
    fireEvent.click(screen.getByRole("button", { name: es.Common.continue }));

    await waitFor(() => expect(screen.getByText(es.SubmitError.description)).toBeInTheDocument());
  });
});
