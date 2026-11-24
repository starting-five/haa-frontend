import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";

import { isWebOtpSupported, useWebOtp } from "../use-web-otp";

// WebOTP only exists on Chrome for Android over HTTPS. jsdom has neither the
// interface nor the credential store, which is exactly the "unsupported" case
// the hook has to survive, so support is stubbed in for the tests that need it
// and the bare environment stands in for every browser that lacks it.

type CredentialsStub = { get: ReturnType<typeof vi.fn> };

function enableWebOtp(get: ReturnType<typeof vi.fn>) {
  (globalThis as unknown as { OTPCredential: unknown }).OTPCredential = class {};
  const credentials: CredentialsStub = { get };
  Object.defineProperty(navigator, "credentials", {
    value: credentials,
    configurable: true,
    writable: true,
  });
}

function disableWebOtp() {
  delete (globalThis as unknown as { OTPCredential?: unknown }).OTPCredential;
}

function Harness({ enabled = true, onDetect }: { enabled?: boolean; onDetect: (code: string) => void }) {
  const detected = useWebOtp({ enabled, onDetect });
  return <span data-testid="detected">{detected ?? ""}</span>;
}

afterEach(() => {
  disableWebOtp();
  vi.restoreAllMocks();
});

describe("useWebOtp", () => {
  it("reports the API as absent in an environment that does not have it", () => {
    disableWebOtp();
    expect(isWebOtpSupported()).toBe(false);
  });

  it("never touches the credential store when the API is absent", () => {
    const onDetect = vi.fn();
    const { getByTestId } = render(<Harness onDetect={onDetect} />);

    // the screen still renders, the field is still typable, nothing is detected
    expect(getByTestId("detected").textContent).toBe("");
    expect(onDetect).not.toHaveBeenCalled();
  });

  it("hands the code to the caller and returns it for display when the browser supplies one", async () => {
    const get = vi.fn().mockResolvedValue({ code: "123456" });
    enableWebOtp(get);

    const onDetect = vi.fn();
    const { getByTestId } = render(<Harness onDetect={onDetect} />);

    await waitFor(() => expect(onDetect).toHaveBeenCalledWith("123456"));
    expect(getByTestId("detected").textContent).toBe("123456");
    expect(get).toHaveBeenCalledTimes(1);
    // it must ask for an SMS-transported OTP, or the browser has nothing to match
    expect(get.mock.calls[0][0]).toMatchObject({ otp: { transport: ["sms"] } });
  });

  it("does not arm a request while it is disabled", () => {
    const get = vi.fn().mockResolvedValue({ code: "123456" });
    enableWebOtp(get);

    render(
      <Harness
        enabled={false}
        onDetect={vi.fn()}
      />
    );
    expect(get).not.toHaveBeenCalled();
  });

  it("aborts the outstanding request when the screen goes away", async () => {
    let capturedSignal: AbortSignal | undefined;
    const get = vi.fn().mockImplementation((options: { signal?: AbortSignal }) => {
      capturedSignal = options.signal;
      return new Promise(() => {});
    });
    enableWebOtp(get);

    const { unmount } = render(<Harness onDetect={vi.fn()} />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(capturedSignal?.aborted).toBe(false);

    unmount();
    // a request left open would keep the page listening for an SMS forever
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("stays silent when the browser rejects or the user dismisses the prompt", async () => {
    const get = vi.fn().mockRejectedValue(new Error("AbortError"));
    enableWebOtp(get);

    const onDetect = vi.fn();
    const { getByTestId } = render(<Harness onDetect={onDetect} />);

    await act(async () => {
      await Promise.resolve();
    });
    // a rejection is not something the patient should be told about
    expect(onDetect).not.toHaveBeenCalled();
    expect(getByTestId("detected").textContent).toBe("");
  });

  it("ignores a credential that carries no code", async () => {
    const get = vi.fn().mockResolvedValue({});
    enableWebOtp(get);

    const onDetect = vi.fn();
    render(<Harness onDetect={onDetect} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(onDetect).not.toHaveBeenCalled();
  });
});
