// Supabase Auth answers a failed OTP send with a single AuthError, and the
// screens used to collapse every one of them onto "please try again". That is
// wrong in both directions: a rate-limited caller is told to retry immediately,
// and a caller whose project has no SMS provider is told to retry forever. The
// personal test project does exactly that — it returns 500 `unexpected_failure`
// with "Unable to get SMS provider" for any number outside `sms_test_otp` —
// which is how a configuration gap reached the user as a transient-sounding
// message.
//
// Codes come from the SDK's own ErrorCode union (@supabase/auth-js 2.x,
// lib/error-codes.d.ts); status is the fallback for responses that carry none.

export type OtpSendFailure = "rateLimited" | "invalidPhone" | "smsUnavailable" | "unknown";

// Structural rather than importing AuthError, so callers can pass anything with
// the same shape and tests do not need to construct SDK classes.
export interface OtpErrorLike {
  status?: number;
  code?: string;
}

export function classifyOtpSendError(error: OtpErrorLike | null | undefined): OtpSendFailure {
  if (!error) {
    return "unknown";
  }

  switch (error.code) {
    case "over_sms_send_rate_limit":
    case "over_request_rate_limit":
      return "rateLimited";
    case "validation_failed":
      return "invalidPhone";
    case "sms_send_failed":
    case "phone_provider_disabled":
    case "otp_disabled":
      return "smsUnavailable";
  }

  if (error.status === 429) {
    return "rateLimited";
  }

  // A 5xx from the auth server is never something the caller can fix by
  // retrying in the next few seconds — an absent or misconfigured SMS provider
  // surfaces here as a bare `unexpected_failure`.
  if (typeof error.status === "number" && error.status >= 500) {
    return "smsUnavailable";
  }

  return "unknown";
}

// Verification fails for reasons the send side never sees, and the screens used
// to report every one of them as "that code didn't work". Two of those reasons
// are not the patient mistyping: the window can have closed, and the request can
// simply not have reached Supabase.
//
// The important caveat is that Supabase CANNOT tell an invalid code from an
// expired one. Both come back 403 `otp_expired`, msg "Token has expired or is
// invalid" — verified against the project directly. So the honest split is:
// claim "expired" only when the caller can prove the window has closed by the
// clock, and otherwise say invalid-or-expired rather than blaming the digits.
export type OtpVerifyFailure =
  "expired" | "incorrect" | "invalidOrExpired" | "rateLimited" | "network" | "smsUnavailable" | "unknown";

export interface OtpVerifyContext {
  // epoch ms the code was sent, when the screen knows it
  sentAt?: number | null;
  expirySeconds?: number;
  now?: number;
}

/** A thrown fetch failure has no status and no code — that is the network case. */
export function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && /fetch|network|load failed/i.test(error.message));
}

export function classifyOtpVerifyError(
  error: OtpErrorLike | null | undefined,
  context: OtpVerifyContext = {}
): OtpVerifyFailure {
  if (!error) {
    return "unknown";
  }

  switch (error.code) {
    case "over_request_rate_limit":
    case "over_sms_send_rate_limit":
      return "rateLimited";
    case "sms_send_failed":
    case "phone_provider_disabled":
    case "otp_disabled":
      return "smsUnavailable";
    case "otp_expired":
      return resolveExpiry(context);
  }

  if (error.status === 429) {
    return "rateLimited";
  }

  // 403 is what a rejected token returns when the SDK hands back no code.
  if (error.status === 403 || error.status === 401) {
    return resolveExpiry(context);
  }

  if (typeof error.status === "number" && error.status >= 500) {
    return "smsUnavailable";
  }

  return "unknown";
}

/**
 * Supabase says only that the token was refused. When the screen knows when the
 * code was sent, the clock settles which refusal it was: past the window it is
 * expired, inside the window the code itself was wrong. With no recorded send
 * there is nothing to reason from, and the neutral wording is the honest answer
 * rather than blaming digits that may have been fine.
 */
function resolveExpiry({ sentAt, expirySeconds, now }: OtpVerifyContext): OtpVerifyFailure {
  if (!sentAt || !expirySeconds) {
    return "invalidOrExpired";
  }
  const elapsedSeconds = ((now ?? Date.now()) - sentAt) / 1000;
  return elapsedSeconds > expirySeconds ? "expired" : "incorrect";
}

/**
 * One place the three OTP screens agree on which message a failure earns. All
 * of these keys live in the `Otp` namespace, which every screen already loads,
 * so a screen maps a failure with `t(OTP_VERIFY_MESSAGE_KEYS[failure])` and none
 * of them grows its own private wording.
 */
export const OTP_VERIFY_MESSAGE_KEYS: Record<OtpVerifyFailure, string> = {
  expired: "expiredCode",
  incorrect: "incorrectCode",
  invalidOrExpired: "invalidOrExpiredCode",
  rateLimited: "verifyRateLimited",
  network: "verifyNetwork",
  smsUnavailable: "verifySmsUnavailable",
  unknown: "verificationFailed",
};
