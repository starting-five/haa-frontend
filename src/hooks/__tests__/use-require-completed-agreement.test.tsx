import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useRequireCompletedAgreement } from "../use-require-completed-agreement";

// The screen this guards tells a patient their case is with an attorney, so the
// question these tests answer is narrow: does anything other than a
// backend-confirmed completed agreement ever get through?

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));

const getAgreementStatus = vi.fn();
vi.mock("@/services/intake", () => ({
  getAgreementStatus: (...args: unknown[]) => getAgreementStatus(...args),
}));

// These tests describe the real guard, so DocuSign launch is treated as enabled
// unless a test says otherwise (the disabled case has its own test below).
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

function Probe({ onResult }: { onResult: (confirmed: boolean) => void }) {
  onResult(useRequireCompletedAgreement());
  return null;
}

describe("useRequireCompletedAgreement", () => {
  beforeEach(() => {
    replace.mockClear();
    getAgreementStatus.mockReset();
    sessionStorage.clear();
    launchEnabled.value = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const lastResult = async () => {
    const results: boolean[] = [];
    render(<Probe onResult={(value) => results.push(value)} />);
    await waitFor(() => expect(getAgreementStatus.mock.calls.length + replace.mock.calls.length).toBeGreaterThan(0));
    return results;
  };

  it("confirms only when the backend reports completed", async () => {
    sessionStorage.setItem("intake_submissionId", "s-1");
    getAgreementStatus.mockResolvedValue({ ok: true, status: "completed" });

    const results = await lastResult();

    await waitFor(() => expect(results.at(-1)).toBe(true));
    expect(replace).not.toHaveBeenCalled();
  });

  it("starts unconfirmed, so the screen is never shown before the backend answers", async () => {
    sessionStorage.setItem("intake_submissionId", "s-1");
    getAgreementStatus.mockResolvedValue({ ok: true, status: "completed" });

    const results = await lastResult();

    expect(results[0]).toBe(false);
  });

  it.each(["sent", "delivered", "created", "declined", "voided"])(
    "sends the patient back to signing when the agreement is %s",
    async (status) => {
      sessionStorage.setItem("intake_submissionId", "s-1");
      getAgreementStatus.mockResolvedValue({ ok: true, status });

      const results = await lastResult();

      await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/intake/hire-attorney"));
      expect(results.at(-1)).toBe(false);
    }
  );

  it("does not confirm when the backend refuses the request", async () => {
    // A submission the caller does not own answers 404, which arrives here as a
    // refusal. It must not be mistaken for a completed agreement.
    sessionStorage.setItem("intake_submissionId", "someone-elses-submission");
    getAgreementStatus.mockResolvedValue({ ok: false, code: "submission_not_found" });

    const results = await lastResult();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/intake/hire-attorney"));
    expect(results.at(-1)).toBe(false);
  });

  it("does not confirm when the status request throws", async () => {
    sessionStorage.setItem("intake_submissionId", "s-1");
    getAgreementStatus.mockRejectedValue(new Error("network"));

    const results = await lastResult();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/intake/hire-attorney"));
    expect(results.at(-1)).toBe(false);
  });

  it("sends a patient with no submission back to the start", async () => {
    const results = await lastResult();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/intake/phone"));
    expect(getAgreementStatus).not.toHaveBeenCalled();
    expect(results.at(-1)).toBe(false);
  });

  it("needs only a submitted case while DocuSign launch is disabled, and asks the backend nothing", async () => {
    launchEnabled.value = false;
    sessionStorage.setItem("intake_submissionId", "s-1");

    const results: boolean[] = [];
    render(<Probe onResult={(value) => results.push(value)} />);

    await waitFor(() => expect(results.at(-1)).toBe(true));
    expect(getAgreementStatus).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("still sends a patient with no submission to the phone step while launch is disabled", async () => {
    launchEnabled.value = false;

    const results: boolean[] = [];
    render(<Probe onResult={(value) => results.push(value)} />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/intake/phone"));
    expect(results.at(-1)).toBe(false);
  });
});
