import { describe, expect, it } from "vitest";
import { nextRate, openRequestPercent, secondsRemaining, timeLeftLabel, uploadPercent } from "@/lib/upload-progress";

// The numbers an upload row draws. None of them may ever be NaN, Infinity or
// negative, and "not known yet" is null rather than a made-up value.

const MB = 1024 * 1024;

describe("uploadPercent", () => {
  it("is the whole share of bytes sent", () => {
    expect(uploadPercent(0, 4 * MB)).toBe(0);
    expect(uploadPercent(1 * MB, 4 * MB)).toBe(25);
    expect(uploadPercent(2 * MB, 4 * MB)).toBe(50);
    expect(uploadPercent(3 * MB, 4 * MB)).toBe(75);
    expect(uploadPercent(4 * MB, 4 * MB)).toBe(100);
  });

  it("never rounds up to a finished upload", () => {
    expect(uploadPercent(4 * MB - 1, 4 * MB)).toBe(99);
  });

  it("reads unknown, empty or impossible input as 0, and never passes 100", () => {
    for (const [loaded, total] of [
      [10, 0],
      [10, -5],
      [Number.NaN, 100],
      [10, Number.NaN],
      [10, Number.POSITIVE_INFINITY],
      [-10, 100],
    ]) {
      expect(uploadPercent(loaded, total)).toBe(0);
    }
    expect(uploadPercent(200, 100)).toBe(100);
  });
});

describe("openRequestPercent", () => {
  it("is the real share while the request is open, held at 99 until Storage answers", () => {
    expect(openRequestPercent(0, 4 * MB)).toBe(0);
    expect(openRequestPercent(1.92 * MB, 4 * MB)).toBe(48);
    expect(openRequestPercent(4 * MB - 1, 4 * MB)).toBe(99);
    expect(openRequestPercent(4 * MB, 4 * MB)).toBe(99);
    expect(openRequestPercent(Number.NaN, 4 * MB)).toBe(0);
  });
});

describe("nextRate", () => {
  it("starts from the first measured rate, then moves towards new readings gradually", () => {
    const first = nextRate(null, { loaded: 0, at: 0 }, { loaded: 1 * MB, at: 1000 });
    expect(first).toBe(1 * MB);
    // a sudden burst to 5 MB/s moves the running rate only a quarter of the way
    const second = nextRate(first, { loaded: 1 * MB, at: 1000 }, { loaded: 6 * MB, at: 2000 });
    expect(second).toBe(2 * MB);
  });

  it("ignores samples that took no time or went backwards", () => {
    expect(nextRate(5, { loaded: 0, at: 1000 }, { loaded: 100, at: 1000 })).toBe(5);
    expect(nextRate(5, { loaded: 0, at: 2000 }, { loaded: 100, at: 1000 })).toBe(5);
    expect(nextRate(5, { loaded: 200, at: 0 }, { loaded: 100, at: 1000 })).toBe(5);
    expect(nextRate(null, { loaded: 0, at: 1000 }, { loaded: 100, at: 1000 })).toBeNull();
  });
});

describe("secondsRemaining", () => {
  it("is the bytes left over the rate", () => {
    expect(secondsRemaining(2 * MB, 10 * MB, 1 * MB)).toBe(8);
  });

  it("is null while the rate is unknown or zero, never Infinity or NaN", () => {
    expect(secondsRemaining(0, 10 * MB, null)).toBeNull();
    expect(secondsRemaining(0, 10 * MB, 0)).toBeNull();
    expect(secondsRemaining(0, 10 * MB, -1)).toBeNull();
    expect(secondsRemaining(0, 10 * MB, Number.NaN)).toBeNull();
    expect(secondsRemaining(0, 0, 1 * MB)).toBeNull();
  });

  it("is never negative, even when more was reported than the total", () => {
    expect(secondsRemaining(11 * MB, 10 * MB, 1 * MB)).toBe(0);
  });
});

describe("timeLeftLabel", () => {
  it("waits a second for the rate to settle", () => {
    expect(timeLeftLabel(20, 999)).toBeNull();
    expect(timeLeftLabel(20, 1000)).toEqual({ unit: "seconds", value: 20 });
  });

  it("says nothing for the last few seconds or an unknown rate", () => {
    expect(timeLeftLabel(2.9, 5000)).toBeNull();
    expect(timeLeftLabel(null, 5000)).toBeNull();
    expect(timeLeftLabel(Number.POSITIVE_INFINITY, 5000)).toBeNull();
    expect(timeLeftLabel(Number.NaN, 5000)).toBeNull();
  });

  it("steps coarsely so it does not flicker: seconds, then fives, then minutes", () => {
    expect(timeLeftLabel(3.0000000000000004, 5000)).toEqual({ unit: "seconds", value: 3 });
    expect(timeLeftLabel(8.4, 5000)).toEqual({ unit: "seconds", value: 8 });
    expect(timeLeftLabel(11, 5000)).toEqual({ unit: "seconds", value: 15 });
    expect(timeLeftLabel(42, 5000)).toEqual({ unit: "seconds", value: 45 });
    expect(timeLeftLabel(58, 5000)).toEqual({ unit: "seconds", value: 55 });
    expect(timeLeftLabel(61, 5000)).toEqual({ unit: "minutes", value: 2 });
    expect(timeLeftLabel(600, 5000)).toEqual({ unit: "minutes", value: 10 });
  });
});
