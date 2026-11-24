import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearOtpSession,
  OTP_SESSION_KEYS,
  otpExpiresAt,
  otpSecondsRemaining,
  readOtpSession,
  startOtpSession,
} from "../otp-session";

// The record of when a code was sent. It exists so the ten minutes belong to the
// send rather than to however long the screen stayed mounted, and so a window
// opened for one number can never be read back for another.

const KEY = OTP_SESSION_KEYS.intake;
const PHONE = "+14075551234";
const OTHER = "+14075559999";

beforeEach(() => sessionStorage.clear());
afterEach(() => sessionStorage.clear());

describe("otp session", () => {
  it("records the moment a code was sent, against the number it went to", () => {
    const session = startOtpSession(KEY, PHONE, 1000);
    expect(session).toEqual({ phone: PHONE, sentAt: 1000 });
    expect(readOtpSession(KEY, PHONE)).toEqual({ phone: PHONE, sentAt: 1000 });
  });

  it("never hands a session back for a different number", () => {
    startOtpSession(KEY, PHONE, 1000);
    // this is the whole defence against an old number's window and error
    // following the user onto a new one
    expect(readOtpSession(KEY, OTHER)).toBeNull();
  });

  it("returns nothing when no code has been sent", () => {
    expect(readOtpSession(KEY, PHONE)).toBeNull();
  });

  it("forgets the session when the number is abandoned", () => {
    startOtpSession(KEY, PHONE, 1000);
    clearOtpSession(KEY);
    expect(readOtpSession(KEY, PHONE)).toBeNull();
  });

  it("keeps each flow's window separate", () => {
    startOtpSession(OTP_SESSION_KEYS.intake, PHONE, 1000);
    startOtpSession(OTP_SESSION_KEYS.ambassador, PHONE, 5000);
    expect(readOtpSession(OTP_SESSION_KEYS.intake, PHONE)?.sentAt).toBe(1000);
    expect(readOtpSession(OTP_SESSION_KEYS.ambassador, PHONE)?.sentAt).toBe(5000);
  });

  it("stores the number and the time and nothing else — never the code", () => {
    startOtpSession(KEY, PHONE, 1000);
    const stored = JSON.parse(sessionStorage.getItem(KEY) ?? "{}");
    // the exhaustive key list is the guarantee: anything resembling a code, a
    // token or a session secret would have to appear here to be stored at all
    expect(Object.keys(stored).sort()).toEqual(["phone", "sentAt"]);
    for (const forbidden of ["code", "token", "otp", "secret", "accessToken"]) {
      expect(stored).not.toHaveProperty(forbidden);
    }
  });

  it("survives a corrupted or hand-edited entry without throwing", () => {
    sessionStorage.setItem(KEY, "{not json");
    expect(readOtpSession(KEY, PHONE)).toBeNull();

    sessionStorage.setItem(KEY, JSON.stringify({ phone: PHONE }));
    expect(readOtpSession(KEY, PHONE)).toBeNull();

    sessionStorage.setItem(KEY, JSON.stringify({ phone: PHONE, sentAt: "soon" }));
    expect(readOtpSession(KEY, PHONE)).toBeNull();
  });

  describe("the window it defines", () => {
    it("ends exactly the configured number of seconds after the send", () => {
      const session = startOtpSession(KEY, PHONE, 1_000_000);
      expect(otpExpiresAt(session, 600)).toBe(1_000_000 + 600_000);
    });

    it("has no end when nothing was sent", () => {
      expect(otpExpiresAt(null, 600)).toBeNull();
    });

    it("reports what is left from the clock, floored at zero", () => {
      const expiresAt = 1_000_000 + 600_000;
      expect(otpSecondsRemaining(expiresAt, 1_000_000)).toBe(600);
      expect(otpSecondsRemaining(expiresAt, 1_000_000 + 120_000)).toBe(480);
      // time spent away from the screen still counts
      expect(otpSecondsRemaining(expiresAt, 1_000_000 + 300_000)).toBe(300);
      expect(otpSecondsRemaining(expiresAt, 1_000_000 + 600_000)).toBe(0);
      expect(otpSecondsRemaining(expiresAt, 1_000_000 + 900_000)).toBe(0);
    });

    it("is zero when there is no window at all", () => {
      expect(otpSecondsRemaining(null, 1_000_000)).toBe(0);
    });
  });
});
