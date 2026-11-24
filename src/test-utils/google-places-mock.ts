import { vi } from "vitest";

// A stand-in for the two Google Maps services LocationInput uses — Places
// autocomplete for a typed query and the Geocoder behind "Use current
// location" — so a page test drives the real field the way a patient does:
// type, pick a suggestion, or ask for the current location. Every query is
// answered with the same suggestions; the Geocoder answers with `currentLocation`.
// Opt-in per test file, like supabase-client-mock.ts.

export interface MockPlace {
  id: string;
  /** what the suggestion list shows */
  text: string;
  formattedAddress: string;
  city?: string;
  state?: string;
  postalCode?: string;
  lat: number;
  lng: number;
}

export const SPRINGFIELD_62704: MockPlace = {
  id: "place-springfield",
  text: "Springfield, IL, USA",
  formattedAddress: "Springfield, IL 62704, USA",
  city: "Springfield",
  state: "IL",
  postalCode: "62704",
  lat: 39.7817,
  lng: -89.6501,
};

export const WINTER_GARDEN_34787: MockPlace = {
  id: "place-winter-garden",
  text: "Winter Garden, FL, USA",
  formattedAddress: "Winter Garden, FL 34787, USA",
  city: "Winter Garden",
  state: "FL",
  postalCode: "34787",
  lat: 28.5653,
  lng: -81.5862,
};

// A place Google resolves without a ZIP — a county is the everyday case.
export const SANGAMON_COUNTY_NO_ZIP: MockPlace = {
  id: "place-sangamon",
  text: "Sangamon County, IL, USA",
  formattedAddress: "Sangamon County, IL, USA",
  state: "IL",
  lat: 39.758,
  lng: -89.659,
};

function components(place: MockPlace) {
  return [
    place.city ? { types: ["locality"], name: place.city } : null,
    place.state ? { types: ["administrative_area_level_1"], name: place.state } : null,
    place.postalCode ? { types: ["postal_code"], name: place.postalCode } : null,
  ].filter((component): component is { types: string[]; name: string } => component !== null);
}

export function installGooglePlacesMock({
  suggestions,
  currentLocation = null,
}: {
  suggestions: MockPlace[];
  currentLocation?: MockPlace | null;
}) {
  const predictions = suggestions.map((place) => ({
    placeId: place.id,
    text: { toString: () => place.text },
    toPlace: () => ({
      id: place.id,
      formattedAddress: place.formattedAddress,
      location: { lat: () => place.lat, lng: () => place.lng },
      addressComponents: components(place).map(({ types, name }) => ({ types, longText: name, shortText: name })),
      fetchFields: vi.fn().mockResolvedValue(undefined),
    }),
  }));

  (window as unknown as { google: unknown }).google = {
    maps: {
      places: {
        AutocompleteSessionToken: class {},
        AutocompleteSuggestion: {
          fetchAutocompleteSuggestions: vi
            .fn()
            .mockResolvedValue({ suggestions: predictions.map((placePrediction) => ({ placePrediction })) }),
        },
      },
      Geocoder: class {
        geocode(_request: unknown, callback: (results: unknown[], status: string) => void) {
          if (!currentLocation) {
            callback([], "ZERO_RESULTS");
            return;
          }
          callback(
            [
              {
                formatted_address: currentLocation.formattedAddress,
                place_id: currentLocation.id,
                geometry: { location: { lat: () => currentLocation.lat, lng: () => currentLocation.lng } },
                address_components: components(currentLocation).map(({ types, name }) => ({
                  types,
                  long_name: name,
                  short_name: name,
                })),
              },
            ],
            "OK"
          );
        }
      },
    },
  };

  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (ok: (position: { coords: { latitude: number; longitude: number } }) => void) =>
        ok({ coords: { latitude: currentLocation?.lat ?? 0, longitude: currentLocation?.lng ?? 0 } }),
    },
  });
}

export function removeGooglePlacesMock() {
  delete (window as unknown as { google?: unknown }).google;
}
