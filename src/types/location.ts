// "autosuggest" / "current_location" are Google-derived (validated); "manual" is
// a user-typed fallback used only when Google Maps is genuinely unavailable, so
// downstream consumers can tell a validated location from an unvalidated one.
export type LocationSource = "autosuggest" | "current_location" | "manual";

// "address" / "city_estimate" come from a Google geocode; "unvalidated" marks a
// manual fallback entry that was never geocoded.
export type LocationPrecision = "address" | "city_estimate" | "unvalidated";

export interface LocationDetails {
  text: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  source: LocationSource;
  precision: LocationPrecision;
}
