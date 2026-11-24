import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPLETION_ATTEMPTS, COMPLETION_RETRY_MS, waitForAgreementCompletion } from "@/lib/agreement-completion";

// The only thing that may move a patient past signing is the backend saying
// the agreement is completed. These pin how patiently that answer is awaited
// and that final refusals are not retried.

const getAgreementStatus = vi.fn();
vi.mock("@/services/intake", () => ({
  getAgreementStatus: (...args: unknown[]) => getAgreementStatus(...args),
}));

describe("waitForAgreementCompletion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getAgreementStatus.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers completed as soon as the backend says so", async () => {
    getAgreementStatus.mockResolvedValue({ ok: true, status: "completed" });

    await expect(waitForAgreementCompletion("sub-1")).resolves.toBe("completed");
    expect(getAgreementStatus).toHaveBeenCalledTimes(1);
    expect(getAgreementStatus).toHaveBeenCalledWith("sub-1");
  });

  it("waits out the moment between the signer finishing and the envelope completing", async () => {
    getAgreementStatus
      .mockResolvedValueOnce({ ok: true, status: "sent" })
      .mockResolvedValueOnce({ ok: true, status: "completed" });

    const outcome = waitForAgreementCompletion("sub-1");
    await vi.advanceTimersByTimeAsync(COMPLETION_RETRY_MS);

    await expect(outcome).resolves.toBe("completed");
    expect(getAgreementStatus).toHaveBeenCalledTimes(2);
  });

  it("gives up as pending after the last attempt rather than guessing", async () => {
    getAgreementStatus.mockResolvedValue({ ok: true, status: "sent" });

    const outcome = waitForAgreementCompletion("sub-1");
    await vi.advanceTimersByTimeAsync(COMPLETION_RETRY_MS * COMPLETION_ATTEMPTS);

    await expect(outcome).resolves.toBe("pending");
    expect(getAgreementStatus).toHaveBeenCalledTimes(COMPLETION_ATTEMPTS);
  });

  it("does not retry a final refusal", async () => {
    getAgreementStatus.mockResolvedValue({ ok: true, status: "declined" });

    await expect(waitForAgreementCompletion("sub-1")).resolves.toBe("declined");
    expect(getAgreementStatus).toHaveBeenCalledTimes(1);
  });

  it("treats a refused request like any other unfinished answer", async () => {
    getAgreementStatus.mockResolvedValue({ ok: false, code: "agreement_not_found" });

    const outcome = waitForAgreementCompletion("sub-1");
    await vi.advanceTimersByTimeAsync(COMPLETION_RETRY_MS * COMPLETION_ATTEMPTS);

    await expect(outcome).resolves.toBe("pending");
  });

  it("asks once when told to", async () => {
    getAgreementStatus.mockResolvedValue({ ok: true, status: "sent" });

    await expect(waitForAgreementCompletion("sub-1", { attempts: 1 })).resolves.toBe("pending");
    expect(getAgreementStatus).toHaveBeenCalledTimes(1);
  });

  it("stops asking once the caller has gone away", async () => {
    let cancelled = false;
    getAgreementStatus.mockResolvedValue({ ok: true, status: "sent" });

    const outcome = waitForAgreementCompletion("sub-1", { isCancelled: () => cancelled });
    cancelled = true;
    await vi.advanceTimersByTimeAsync(COMPLETION_RETRY_MS * COMPLETION_ATTEMPTS);

    await expect(outcome).resolves.toBe("pending");
    expect(getAgreementStatus).toHaveBeenCalledTimes(1);
  });
});
