import { describe, expect, it } from "vitest";
import {
  classifyOtpSendError,
  classifyOtpVerifyError,
  isNetworkFailure,
  OTP_VERIFY_MESSAGE_KEYS,
  type OtpVerifyFailure,
} from "../auth-otp-errors";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";

describe("classifyOtpSendError", () => {
  // Verbatim from the personal test project on 2026-09-17: POST /auth/v1/otp
  // with a number outside sms_test_otp answers
  // {"code":500,"error_code":"unexpected_failure","msg":"Unable to get SMS provider"}.
  // supabase-js surfaces error_code as `code` and the HTTP status as `status`.
  it("reads a project with no SMS provider as smsUnavailable, not a retry", () => {
    expect(classifyOtpSendError({ status: 500, code: "unexpected_failure" })).toBe("smsUnavailable");
  });

  it("reads the documented provider codes as smsUnavailable", () => {
    expect(classifyOtpSendError({ status: 422, code: "sms_send_failed" })).toBe("smsUnavailable");
    expect(classifyOtpSendError({ status: 422, code: "phone_provider_disabled" })).toBe("smsUnavailable");
    expect(classifyOtpSendError({ status: 422, code: "otp_disabled" })).toBe("smsUnavailable");
  });

  it("reads both rate-limit codes as rateLimited", () => {
    expect(classifyOtpSendError({ status: 429, code: "over_sms_send_rate_limit" })).toBe("rateLimited");
    expect(classifyOtpSendError({ status: 429, code: "over_request_rate_limit" })).toBe("rateLimited");
  });

  it("reads a rejected number as invalidPhone so it can go against the field", () => {
    expect(classifyOtpSendError({ status: 422, code: "validation_failed" })).toBe("invalidPhone");
  });

  it("falls back to status when the response carries no code", () => {
    expect(classifyOtpSendError({ status: 429 })).toBe("rateLimited");
    expect(classifyOtpSendError({ status: 500 })).toBe("smsUnavailable");
    expect(classifyOtpSendError({ status: 503 })).toBe("smsUnavailable");
  });

  it("stays unknown rather than guessing", () => {
    expect(classifyOtpSendError(null)).toBe("unknown");
    expect(classifyOtpSendError(undefined)).toBe("unknown");
    // A bare 400 is not necessarily the phone number, so it must not be
    // reported against the phone field.
    expect(classifyOtpSendError({ status: 400 })).toBe("unknown");
    expect(classifyOtpSendError({ status: 401, code: "invalid_credentials" })).toBe("unknown");
    expect(classifyOtpSendError({})).toBe("unknown");
  });

  it("prefers the code over the status when the two disagree", () => {
    // A rate limit delivered with a 500 is still a rate limit.
    expect(classifyOtpSendError({ status: 500, code: "over_sms_send_rate_limit" })).toBe("rateLimited");
  });
});

// ---------------------------------------------------------------------------
// Verification failures. The one that matters is that Supabase answers a wrong
// code and an expired code identically — 403 `otp_expired`, "Token has expired
// or is invalid" — so the classifier must not claim to know which it was unless
// the clock proves it.
// ---------------------------------------------------------------------------
describe("classifyOtpVerifyError", () => {
  const TEN_MINUTES = 600;

  it("will not call an ambiguous failure 'expired' without a send time", () => {
    expect(classifyOtpVerifyError({ code: "otp_expired", status: 403 })).toBe("invalidOrExpired");
  });

  it("blames the code, not the clock, while the window is still open", () => {
    const sentAt = 1_000_000;
    expect(
      classifyOtpVerifyError(
        { code: "otp_expired", status: 403 },
        { sentAt, expirySeconds: TEN_MINUTES, now: sentAt + 9 * 60 * 1000 }
      )
    ).toBe("incorrect");
  });

  it("says expired only once the window has demonstrably closed", () => {
    const sentAt = 1_000_000;
    expect(
      classifyOtpVerifyError(
        { code: "otp_expired", status: 403 },
        { sentAt, expirySeconds: TEN_MINUTES, now: sentAt + 10 * 60 * 1000 + 1 }
      )
    ).toBe("expired");
  });

  it("separates a rate limit from a bad code", () => {
    expect(classifyOtpVerifyError({ code: "over_request_rate_limit" })).toBe("rateLimited");
    expect(classifyOtpVerifyError({ status: 429 })).toBe("rateLimited");
  });

  it("separates a provider outage from a bad code", () => {
    expect(classifyOtpVerifyError({ code: "phone_provider_disabled" })).toBe("smsUnavailable");
    expect(classifyOtpVerifyError({ status: 503 })).toBe("smsUnavailable");
  });

  it("treats a bare 403 as the same ambiguous case", () => {
    expect(classifyOtpVerifyError({ status: 403 })).toBe("invalidOrExpired");
  });

  it("falls back to unknown rather than guessing", () => {
    expect(classifyOtpVerifyError(null)).toBe("unknown");
    expect(classifyOtpVerifyError({ code: "something_new" })).toBe("unknown");
  });

  it("maps every failure to a key that exists in both locales", () => {
    const failures: OtpVerifyFailure[] = [
      "expired",
      "incorrect",
      "invalidOrExpired",
      "rateLimited",
      "network",
      "smsUnavailable",
      "unknown",
    ];
    for (const failure of failures) {
      const key = OTP_VERIFY_MESSAGE_KEYS[failure];
      expect(en.Otp, `en is missing Otp.${key}`).toHaveProperty(key);
      expect(es.Otp, `es is missing Otp.${key}`).toHaveProperty(key);
    }
  });
});

describe("isNetworkFailure", () => {
  it("recognises a thrown fetch failure", () => {
    expect(isNetworkFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkFailure(new Error("Load failed"))).toBe(true);
  });

  it("does not mistake an ordinary error for a dropped connection", () => {
    expect(isNetworkFailure(new Error("invalid code"))).toBe(false);
    expect(isNetworkFailure({ status: 403 })).toBe(false);
  });
});
