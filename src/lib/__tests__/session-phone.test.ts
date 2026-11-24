import { describe, expect, it } from "vitest";
import { sessionPhoneE164 } from "@/lib/session-phone";

describe("sessionPhoneE164", () => {
  it("restores the plus Supabase leaves off, and keeps one that is there", () => {
    expect(sessionPhoneE164("14075551234")).toBe("+14075551234");
    expect(sessionPhoneE164("+14075551234")).toBe("+14075551234");
  });

  it("is empty when there is no phone", () => {
    expect(sessionPhoneE164("")).toBe("");
    expect(sessionPhoneE164(null)).toBe("");
    expect(sessionPhoneE164(undefined)).toBe("");
  });
});
