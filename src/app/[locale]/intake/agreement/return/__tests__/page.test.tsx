import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

// DocuSign sends the patient back here with an event in the query string that
// anyone can type. These pin that the route asks the backend instead, and
// that a confirmed signature goes straight back to the dashboard.

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));

const getAgreementStatus = vi.fn();
vi.mock("@/services/intake", () => ({
  getAgreementStatus: (...args: unknown[]) => getAgreementStatus(...args),
}));

// Whether the route is running inside the agreement screen's frame.
let embedded = false;
vi.mock("@/lib/agreement-completion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agreement-completion")>();
  return { ...actual, isEmbeddedInApplication: () => embedded };
});

import IntakeAgreementReturnPage from "../page";

describe("agreement return route", () => {
  beforeEach(() => {
    replace.mockReset();
    getAgreementStatus.mockReset();
    embedded = false;
    sessionStorage.clear();
    sessionStorage.setItem("intake_submissionId", "sub-1");
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("returns to the dashboard when the backend reports completed", async () => {
    getAgreementStatus.mockResolvedValue({ ok: true, status: "completed" });

    render(<IntakeAgreementReturnPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/intake/dashboard"));
    expect(getAgreementStatus).toHaveBeenCalledWith("sub-1");
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("returns a declined signature to the agreement screen without waiting", async () => {
    getAgreementStatus.mockResolvedValue({ ok: true, status: "declined" });

    render(<IntakeAgreementReturnPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/intake/agreement"));
    expect(getAgreementStatus).toHaveBeenCalledTimes(1);
  });

  it("inside the agreement screen's frame, hands over to the screen instead of navigating", async () => {
    embedded = true;
    const postMessage = vi.spyOn(window.parent, "postMessage");

    render(<IntakeAgreementReturnPage />);

    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith({ type: "haa:agreement-return" }, window.location.origin)
    );
    // The screen that framed it does the check; a second one here would race it.
    expect(getAgreementStatus).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends a tab with no submission back to the start of verification", async () => {
    sessionStorage.clear();

    render(<IntakeAgreementReturnPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/intake/phone"));
    expect(getAgreementStatus).not.toHaveBeenCalled();
  });
});
