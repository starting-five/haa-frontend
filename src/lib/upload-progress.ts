/**
 * The numbers an upload row shows, from the bytes the browser reports sent.
 * Every function returns a value that is safe to draw: no NaN, no Infinity, no
 * negative time, and null wherever the honest answer is "not known yet".
 */

/** Whole percent sent, 0–100. Unknown or empty totals read as 0. */
export function uploadPercent(loaded: number, total: number): number {
  if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0 || loaded <= 0) return 0;
  return Math.min(100, Math.floor((loaded / total) * 100));
}

/**
 * The percentage to show while the request is still open. Every byte can have
 * been sent while Storage is still writing the object — 1.3 s for a 12 MB PDF
 * in the local trace — so the row stops at 99 until Storage has answered; only
 * a completed upload reads 100.
 */
export function openRequestPercent(loaded: number, total: number): number {
  return Math.min(99, uploadPercent(loaded, total));
}

export interface ByteSample {
  loaded: number;
  // milliseconds, from performance.now() or Date.now()
  at: number;
}

// How much one new reading moves the running rate. Low enough that a burst or
// a stall does not swing the estimate from one event to the next.
const RATE_WEIGHT = 0.25;

/**
 * The running upload rate in bytes per second, smoothed across progress events.
 * A sample that moved no time or went backwards changes nothing.
 */
export function nextRate(previousRate: number | null, from: ByteSample, to: ByteSample): number | null {
  const seconds = (to.at - from.at) / 1000;
  const bytes = to.loaded - from.loaded;
  if (!(seconds > 0) || bytes < 0) return previousRate;
  const instant = bytes / seconds;
  if (!Number.isFinite(instant)) return previousRate;
  if (previousRate === null || !Number.isFinite(previousRate)) return instant;
  return previousRate + RATE_WEIGHT * (instant - previousRate);
}

/** Seconds left at the given rate, or null while the rate is unknown or zero. */
export function secondsRemaining(loaded: number, total: number, bytesPerSecond: number | null): number | null {
  if (bytesPerSecond === null || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return null;
  if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0) return null;
  const remaining = Math.max(0, total - loaded);
  const seconds = remaining / bytesPerSecond;
  return Number.isFinite(seconds) ? seconds : null;
}

// The estimate is shown only once the rate has had a moment to settle, and only
// while there is enough left for it to be worth reading.
export const ESTIMATE_AFTER_MS = 1000;
const MIN_SECONDS_SHOWN = 3;

export type TimeLeft = { unit: "seconds"; value: number } | { unit: "minutes"; value: number };

/**
 * What the row says about time left, in steps coarse enough not to flicker:
 * whole seconds under 10, fives under a minute, then whole minutes (rounded, so a
 * float artefact such as 3.0000000000000004 never reads as 4). Null hides
 * the estimate.
 */
export function timeLeftLabel(seconds: number | null, elapsedMs: number): TimeLeft | null {
  if (seconds === null || !Number.isFinite(seconds) || elapsedMs < ESTIMATE_AFTER_MS) return null;
  if (seconds < MIN_SECONDS_SHOWN) return null;
  if (seconds < 10) return { unit: "seconds", value: Math.round(seconds) };
  if (seconds < 60) return { unit: "seconds", value: Math.min(55, Math.ceil(seconds / 5) * 5) };
  return { unit: "minutes", value: Math.ceil(seconds / 60) };
}
