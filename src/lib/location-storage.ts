import type { LocationDetails } from "@/types/location";

/**
 * The location screens persist the structured details they resolve (from a
 * Google suggestion, current location, or a manual fallback entry) under an
 * `intake_*LocationDetails` sessionStorage key. This reads one back so the
 * payload builders in otp/review can forward it to the backend, or null when
 * nothing was stored or the value is unreadable.
 */
export function readLocationDetails(key: string): LocationDetails | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocationDetails;
  } catch {
    return null;
  }
}
