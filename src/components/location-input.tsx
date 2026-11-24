"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { FloatingInput } from "@/components/ui/floating-input";
import type { LocationDetails, LocationPrecision, LocationSource } from "@/types/location";

type AddressComponent = {
  long_name?: string;
  short_name?: string;
  longText?: string;
  shortText?: string;
  types?: string[];
};

type PlacePrediction = {
  placeId?: string;
  text: {
    toString: () => string;
  };
  toPlace: () => {
    id?: string;
    formattedAddress?: string;
    location?: {
      lat: () => number;
      lng: () => number;
    };
    addressComponents?: AddressComponent[];
    fetchFields: (request: { fields: string[] }) => Promise<void>;
  };
};

type PlaceSuggestion = {
  description: string;
  placeId: string;
  prediction?: PlacePrediction;
};

type AutocompleteSessionTokenCtor = new () => unknown;

type AutocompleteSuggestionApi = {
  fetchAutocompleteSuggestions: (request: {
    input: string;
    includedRegionCodes?: string[];
    includedPrimaryTypes?: string[];
    region?: string;
    sessionToken?: unknown;
  }) => Promise<{
    suggestions: Array<{
      placePrediction?: PlacePrediction;
    }>;
  }>;
};

type GeocodeResult = {
  address_components?: AddressComponent[];
  formatted_address?: string;
  place_id?: string;
  geometry?: {
    location?: {
      lat: () => number;
      lng: () => number;
    };
  };
};

type GoogleMapsWindow = Window & {
  google?: {
    maps?: {
      places?: {
        AutocompleteSessionToken: AutocompleteSessionTokenCtor;
        AutocompleteSuggestion: AutocompleteSuggestionApi;
      };
      Geocoder: new () => {
        geocode: (
          request: { location: { lat: number; lng: number } },
          callback: (results: GeocodeResult[] | null, status: string) => void
        ) => void;
      };
    };
  };
};

const ZIP_CODE_PATTERN = /\b\d{5}(?:-\d{4})?\b/;

function extractZipCode(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const match = text.match(ZIP_CODE_PATTERN);
  return match?.[0];
}

let googleMapsLoadPromise: Promise<boolean> | null = null;

function loadGoogleMaps(apiKey: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);

  const win = window as GoogleMapsWindow;
  if (win.google?.maps?.places) return Promise.resolve(true);
  if (googleMapsLoadPromise) return googleMapsLoadPromise;

  googleMapsLoadPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&libraries=places`;
    script.async = true;
    script.defer = true;
    // With loading=async the places library becomes usable a moment AFTER the
    // script's load event fires — reading it synchronously here is a race that
    // would wrongly drop the patient into the manual fallback while Google is
    // actually coming up. Wait (bounded) for the library to be ready.
    script.onload = () => {
      const start = Date.now();
      const poll = () => {
        if (win.google?.maps?.places && win.google?.maps?.Geocoder) {
          resolve(true);
          return;
        }
        if (Date.now() - start > 6000) {
          resolve(false);
          return;
        }
        window.setTimeout(poll, 60);
      };
      poll();
    };
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return googleMapsLoadPromise;
}

// Google's US predictions end in ", USA"; the field only ever takes US places.
function stripCountrySuffix(text: string): string {
  return text.replace(/,\s*(USA|United States)$/i, "");
}

// The patient-facing text for a place. Without coarseOnly it keeps Google's
// formatted street address when there is one; with it the text never shows a
// street — only "City, ST 12345", "City, ST" or the ZIP on its own — while the
// precise place (id, lat/lng, components) still travels in LocationDetails.
function parseLocation(result: GeocodeResult, options?: { coarseOnly?: boolean; cityStateOnly?: boolean }): string {
  const components = result.address_components ?? [];
  const hasStreetAddress = components.some((c) => c.types?.includes("street_number") || c.types?.includes("route"));

  const getLong = (component: AddressComponent | undefined) => component?.long_name ?? component?.longText ?? "";
  const getShort = (component: AddressComponent | undefined) =>
    component?.short_name ?? component?.shortText ?? getLong(component);

  // Preserve full street address when geocode/place details include one.
  if (!options?.coarseOnly && hasStreetAddress && result.formatted_address) {
    return result.formatted_address;
  }

  const city =
    getLong(components.find((c) => c.types?.includes("locality"))) ||
    getLong(components.find((c) => c.types?.includes("sublocality"))) ||
    getLong(components.find((c) => c.types?.includes("postal_town"))) ||
    "";
  const state = getShort(components.find((c) => c.types?.includes("administrative_area_level_1"))) || "";
  const zip = getLong(components.find((c) => c.types?.includes("postal_code"))) || "";

  if (options?.cityStateOnly) {
    if (city && state) return `${city}, ${state}`;
    if (city) return city;
  }

  if (city && state && zip) return `${city}, ${state} ${zip}`;
  if (city && state) return `${city}, ${state}`;
  if (zip) return zip;
  // a coarse display must never fall back to a street address
  if (options?.coarseOnly && hasStreetAddress) return city || state;
  return result.formatted_address ?? "";
}

function toLocationDetails(
  result: GeocodeResult,
  source: LocationSource,
  options?: { coarseOnly?: boolean; cityStateOnly?: boolean; fallbackText?: string; placeId?: string }
): LocationDetails | null {
  const text = parseLocation(result, options);
  if (!text) return null;

  const components = result.address_components ?? [];
  const getLong = (component: AddressComponent | undefined) => component?.long_name ?? component?.longText;
  const getShort = (component: AddressComponent | undefined) =>
    component?.short_name ?? component?.shortText ?? getLong(component);
  const city =
    getLong(components.find((c) => c.types?.includes("locality"))) ??
    getLong(components.find((c) => c.types?.includes("sublocality"))) ??
    getLong(components.find((c) => c.types?.includes("postal_town")));
  const state = getShort(components.find((c) => c.types?.includes("administrative_area_level_1")));
  const postalCode = getLong(components.find((c) => c.types?.includes("postal_code")));

  const lat = result.geometry?.location?.lat?.();
  const lng = result.geometry?.location?.lng?.();

  const precision: LocationPrecision = options?.coarseOnly ? "city_estimate" : "address";

  return {
    text: options?.fallbackText ?? text,
    latitude: typeof lat === "number" ? lat : undefined,
    longitude: typeof lng === "number" ? lng : undefined,
    placeId: options?.placeId ?? result.place_id,
    city,
    state,
    postalCode,
    source,
    precision,
  };
}

interface LocationInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onValidityChange?: (isValid: boolean) => void;
  onLocationDetailsChange?: (details: LocationDetails | null) => void;
  error?: string;
  useCurrentLocationLabel?: string;
  showUseCurrentLocation?: boolean;
  locationErrorMessage?: string;
  reserveErrorSpace?: boolean;
  cityStateOnly?: boolean;
  focusBorderColor?: string;
  focusBorderWidth?: string;
  // "cityStateZip" is the residence / treatment-area presentation (Figma 1949:4322,
  // 1949:4417): suggestions are limited to places, not addresses, and the field
  // shows "City, ST ZIP" rather than a street. Defaults to the full address.
  displayFormat?: "full" | "cityStateZip";
  // When true, location is valid only if it resolves to, or contains, a ZIP.
  requirePostalCode?: boolean;
  postalCodeRequiredMessage?: string;
}

export function LocationInput({
  id,
  label,
  value,
  onChange,
  onValidityChange,
  onLocationDetailsChange,
  error,
  useCurrentLocationLabel = "Use current location",
  showUseCurrentLocation = true,
  locationErrorMessage = "We could not detect your location.",
  reserveErrorSpace,
  cityStateOnly = false,
  focusBorderColor = "#cc007e",
  focusBorderWidth = "1px",
  displayFormat = "full",
  requirePostalCode = false,
  postalCodeRequiredMessage = "Enter a ZIP code.",
}: LocationInputProps) {
  const coarse = displayFormat === "cityStateZip" || cityStateOnly;
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  // The field's validity as of its last resolution — a pick, the current
  // location, a manual entry or a keystroke. `revision` counts resolutions so
  // every one reaches the page, including one that leaves validity unchanged.
  const [validity, setValidity] = useState({ isValid: Boolean(value.trim()), revision: 0 });
  const resolveValidity = (isValid: boolean) =>
    setValidity((previous) => ({ isValid, revision: previous.revision + 1 }));
  const [locationDetails, setLocationDetails] = useState<LocationDetails | null>(null);
  // null = still checking, true = Google Places is usable, false = genuinely
  // unavailable (no key / script blocked / load error). Only `false` unlocks the
  // manual free-text fallback — an unselected suggestion never does.
  const [googleAvailable, setGoogleAvailable] = useState<boolean | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const suppressSuggestionRef = useRef(false);
  const autocompleteSuggestionRef = useRef<null | AutocompleteSuggestionApi>(null);
  const sessionTokenRef = useRef<unknown>(null);
  const autocompleteSessionTokenCtorRef = useRef<null | AutocompleteSessionTokenCtor>(null);
  const geocoderRef = useRef<null | {
    geocode: (
      request: { location: { lat: number; lng: number } },
      callback: (results: GeocodeResult[] | null, status: string) => void
    ) => void;
  }>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  const ensureGoogleServices = useCallback(async (): Promise<boolean> => {
    if (!apiKey) return false;

    if (autocompleteSuggestionRef.current && geocoderRef.current) {
      return true;
    }

    const loaded = await loadGoogleMaps(apiKey);
    if (!loaded) return false;

    const win = window as GoogleMapsWindow;
    const maps = win.google?.maps;
    const places = maps?.places;
    if (!maps || !places) return false;

    autocompleteSuggestionRef.current = places.AutocompleteSuggestion;
    autocompleteSessionTokenCtorRef.current = places.AutocompleteSessionToken;
    if (!sessionTokenRef.current && autocompleteSessionTokenCtorRef.current) {
      sessionTokenRef.current = new autocompleteSessionTokenCtorRef.current();
    }
    geocoderRef.current = new maps.Geocoder();

    return true;
  }, [apiKey]);

  // A fallback entry used only when Google is genuinely unavailable: the typed
  // text is kept as an explicitly unvalidated manual location — never labelled
  // as Google-validated.
  const applyManualEntry = (raw: string) => {
    const trimmed = raw.trim();
    const zip = extractZipCode(trimmed);
    const valid = Boolean(trimmed) && (!requirePostalCode || Boolean(zip));
    resolveValidity(valid);
    if (!trimmed || !valid) {
      setLocationDetails(null);
      if (trimmed && requirePostalCode) {
        setLocationError(postalCodeRequiredMessage);
      }
      return;
    }
    setLocationDetails({ text: trimmed, postalCode: zip, source: "manual", precision: "unvalidated" });
    if (locationError) setLocationError("");
  };

  useEffect(() => {
    let cancelled = false;
    void ensureGoogleServices().then((ok) => {
      if (!cancelled) setGoogleAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When Google is confirmed unavailable, text already typed during the load
  // attempt is accepted as a manual entry so the patient is never trapped; a
  // real Google-derived selection is left untouched.
  useEffect(() => {
    if (googleAvailable !== false) return;
    if (locationDetails && locationDetails.source !== "manual") return;
    applyManualEntry(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleAvailable]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // Report validity/details to the page only after the field itself acted, and
  // not on the first mount. The page callbacks are inline (new identity each
  // render), so depending on them made these effects fire every render and
  // clobber values the page set itself — e.g. treatment-area's "same as home"
  // copy, or a restored selection — with this component's own (null) state.
  //
  // Validity is reported on every resolution, not only when it flips. A page
  // seeds its own flag from what it restored, which need not match this one:
  // "Use current location" on a field already holding a place left the
  // summary's accident editor disabled, because the page's flag was false,
  // this one was already true, and nothing changed to report.
  useEffect(() => {
    if (validity.revision === 0) return;
    onValidityChange?.(validity.isValid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validity]);

  const reportedDetails = useRef(false);
  useEffect(() => {
    if (!reportedDetails.current) {
      reportedDetails.current = true;
      return;
    }
    onLocationDetailsChange?.(locationDetails);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationDetails]);

  useEffect(() => {
    const input = value.trim();

    if (suppressSuggestionRef.current) {
      suppressSuggestionRef.current = false;
      return;
    }

    if (!input) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    if (!isInputFocused) {
      setShowSuggestions(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      const ready = await ensureGoogleServices();
      if (!ready || !autocompleteSuggestionRef.current) return;
      if (!sessionTokenRef.current && autocompleteSessionTokenCtorRef.current) {
        sessionTokenRef.current = new autocompleteSessionTokenCtorRef.current();
      }

      try {
        const response = await autocompleteSuggestionRef.current.fetchAutocompleteSuggestions({
          input,
          includedRegionCodes: ["us"],
          // "(regions)" is Google's collection of localities, sublocalities and
          // postal codes — a ZIP or a city can be picked, a street address cannot.
          ...(coarse ? { includedPrimaryTypes: ["(regions)"] } : {}),
          region: "us",
          sessionToken: sessionTokenRef.current ?? undefined,
        });

        const nextSuggestions = (response.suggestions ?? [])
          .map((item: { placePrediction?: PlacePrediction }) => {
            const prediction = item.placePrediction;
            if (!prediction?.placeId) return null;
            return {
              placeId: prediction.placeId,
              description: coarse ? stripCountrySuffix(prediction.text.toString()) : prediction.text.toString(),
              prediction,
            } as PlaceSuggestion;
          })
          .filter((item: PlaceSuggestion | null): item is PlaceSuggestion => Boolean(item))
          .slice(0, 5);

        if (!nextSuggestions.length) {
          setSuggestions([]);
          setShowSuggestions(false);
          return;
        }

        setSuggestions(nextSuggestions);
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [value, coarse, isInputFocused, ensureGoogleServices]);

  const applyLocation = (next: string, details?: LocationDetails | null) => {
    suppressSuggestionRef.current = true;

    const resolvedZip = details?.postalCode ?? extractZipCode(details?.text) ?? extractZipCode(next);
    if (requirePostalCode && !resolvedZip) {
      resolveValidity(false);
      setLocationDetails(null);
      setLocationError(postalCodeRequiredMessage);
      onChange(next);
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    resolveValidity(true);
    setLocationDetails(details ? { ...details, postalCode: details.postalCode ?? resolvedZip } : null);
    onChange(next);
    setSuggestions([]);
    setShowSuggestions(false);
    if (locationError) setLocationError("");
  };

  const handleSelectSuggestion = async (suggestion: PlaceSuggestion) => {
    if (!suggestion.prediction) {
      applyLocation(suggestion.description);
      return;
    }

    try {
      const place = suggestion.prediction.toPlace();
      await place.fetchFields({ fields: ["id", "formattedAddress", "location", "addressComponents"] });

      const result: GeocodeResult = {
        place_id: place.id ?? suggestion.placeId,
        formatted_address: place.formattedAddress,
        address_components: place.addressComponents,
        geometry: place.location
          ? {
              location: {
                lat: place.location.lat,
                lng: place.location.lng,
              },
            }
          : undefined,
      };

      const details = toLocationDetails(result, "autosuggest", {
        coarseOnly: coarse,
        fallbackText: coarse ? undefined : suggestion.description,
        placeId: suggestion.placeId,
      });

      if (!details) {
        applyLocation(suggestion.description, {
          text: suggestion.description,
          placeId: suggestion.placeId,
          source: "autosuggest",
          precision: coarse ? "city_estimate" : "address",
        });
      } else {
        applyLocation(details.text, details);
      }

      if (autocompleteSessionTokenCtorRef.current) {
        sessionTokenRef.current = new autocompleteSessionTokenCtorRef.current();
      }
    } catch {
      applyLocation(suggestion.description, {
        text: suggestion.description,
        placeId: suggestion.placeId,
        source: "autosuggest",
        precision: coarse ? "city_estimate" : "address",
      });
    }
  };

  const handleUseLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const ready = await ensureGoogleServices();
          if (!ready || !geocoderRef.current) {
            throw new Error("google_unavailable");
          }

          geocoderRef.current.geocode(
            { location: { lat: coords.latitude, lng: coords.longitude } },
            (results, status) => {
              if (status !== "OK" || !results?.length) {
                setLocationError(locationErrorMessage);
                return;
              }

              const details = toLocationDetails(results[0], "current_location", { coarseOnly: true });
              if (!details) {
                setLocationError(locationErrorMessage);
                return;
              }

              applyLocation(details.text, details);
            }
          );
        } catch {
          setLocationError(locationErrorMessage);
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocationError(locationErrorMessage);
        setLocating(false);
      }
    );
  };

  return (
    <div
      ref={rootRef}
      className="relative"
    >
      <FloatingInput
        id={id}
        label={label}
        value={value}
        onChange={(v) => {
          onChange(v);
          if (locationError) setLocationError("");
          if (googleAvailable === false) {
            // Google is unavailable — accept the text as an unvalidated manual entry.
            applyManualEntry(v);
          } else {
            // Google is available — typing invalidates until a suggestion is picked.
            resolveValidity(false);
            if (locationDetails) setLocationDetails(null);
          }
        }}
        error={error || locationError}
        reserveErrorSpace={reserveErrorSpace}
        focusBorderColor={focusBorderColor}
        focusBorderWidth={focusBorderWidth}
        onFocus={() => setIsInputFocused(true)}
        onBlur={() => setIsInputFocused(false)}
      />
      {showSuggestions && suggestions.length > 0 ? (
        <ul className="absolute z-20 mt-[2px] max-h-[220px] w-full overflow-auto rounded-[12px] border border-[#e5e5ea] bg-white shadow-[0_10px_30px_rgba(17,17,17,0.08)]">
          {suggestions.map((suggestion) => (
            <li key={suggestion.placeId}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  void handleSelectSuggestion(suggestion);
                }}
                className="w-full border-b border-[#f3f4f6] px-4 py-3 text-left text-[14px] text-[#111827] last:border-b-0 hover:bg-[#fafafa]"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {suggestion.description}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {showUseCurrentLocation ? (
        <button
          type="button"
          onClick={handleUseLocation}
          disabled={locating}
          className="mt-[16px] flex items-center gap-[4px] text-[14px] text-[#cc007e] font-medium disabled:opacity-50"
        >
          <Image
            src="/assets/intake/location-crosshair.png"
            alt=""
            width={14}
            height={14}
            loading="eager"
            unoptimized
            className="size-[14px] shrink-0"
          />
          {locating ? "…" : useCurrentLocationLabel}
        </button>
      ) : null}
    </div>
  );
}
