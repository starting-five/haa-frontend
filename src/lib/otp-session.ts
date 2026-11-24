"use client";

// A code's ten minutes start when it was successfully sent, not when the screen
// happened to mount. That moment has to survive leaving the screen and coming
// back, so it is written down rather than held in component state — otherwise a
// remount hands the patient a fresh 10:00 for a code that is already half spent.
//
// Only the number the code went to and the moment it was sent are stored. The
// code itself is never written anywhere: the server stays the only thing that
// decides whether it is valid, and this is presentation state.
//
// The number is part of the record on purpose. Reading a session back requires
// the phone to match, so a session belonging to an old number can never be
// mistaken for the current one — which is what let a stale error and a stale
// countdown follow the patient onto a new number.

// How long a code Supabase sends stays good. This sizes the window the
// countdown draws and gates the Brand Ambassador resend; it does NOT decide
// validity. The authority is Supabase Auth's own `sms_otp_exp`, which is 600 on
// both the company project and the personal test project — keep the two in step
// or the screen will promise a window the provider does not honour.
export const OTP_EXPIRY_SECONDS = 600;

export interface OtpSession {
  phone: string;
  sentAt: number;
}

export const OTP_SESSION_KEYS = {
  intake: "otp_session_intake",
  patientLogin: "otp_session_patient_login",
  ambassador: "otp_session_ambassador",
} as const;

export type OtpSessionKey = (typeof OTP_SESSION_KEYS)[keyof typeof OTP_SESSION_KEYS];

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

/** Records a successful send. Call this only when the provider accepted it. */
export function startOtpSession(key: OtpSessionKey, phone: string, now: number = Date.now()): OtpSession {
  const session: OtpSession = { phone, sentAt: now };
  if (canUseStorage()) {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(session));
    } catch {
      // A private window with storage blocked still verifies codes; it just
      // cannot draw a countdown that survives navigation.
    }
  }
  return session;
}

/**
 * Returns the stored session only when it belongs to `phone`. A session for any
 * other number is treated as absent, so nothing from a previous number leaks in.
 */
export function readOtpSession(key: OtpSessionKey, phone: string): OtpSession | null {
  if (!canUseStorage() || !phone) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { phone: storedPhone, sentAt } = parsed as Partial<OtpSession>;
    if (typeof storedPhone !== "string" || typeof sentAt !== "number" || !Number.isFinite(sentAt)) return null;
    if (storedPhone !== phone) return null;
    return { phone: storedPhone, sentAt };
  } catch {
    return null;
  }
}

export function clearOtpSession(key: OtpSessionKey): void {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // nothing to do — an unreadable store is an absent one
  }
}

/** The wall-clock moment the code stops being accepted. */
export function otpExpiresAt(session: OtpSession | null, expirySeconds: number): number | null {
  return session ? session.sentAt + expirySeconds * 1000 : null;
}

/** Seconds left on the window, floored at zero. */
export function otpSecondsRemaining(expiresAt: number | null, now: number = Date.now()): number {
  if (expiresAt === null) return 0;
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}
