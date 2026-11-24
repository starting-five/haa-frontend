import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { LocationInput } from "@/components/location-input";
import type { LocationDetails } from "@/types/location";
import {
  installGooglePlacesMock,
  removeGooglePlacesMock,
  SANGAMON_COUNTY_NO_ZIP,
  SPRINGFIELD_62704,
  WINTER_GARDEN_34787,
} from "@/test-utils/google-places-mock";

// These pin the Google-Places behaviour of the shared location field: it loads
// Google, turns a query into suggestions, and a selected suggestion into a
// validated structured location (city/state/zip/lat-lng, source "autosuggest").
// When Google is genuinely unavailable it must NOT trap the patient — the typed
// text is accepted as an explicitly unvalidated "manual" entry instead, and it
// is never falsely labelled Google-validated. Google is mocked (no network),
// which is exactly why the deploy is also QA'd against the real API separately.

type Cb = (d: LocationDetails | null) => void;

// A place the mocked Google Places API returns for any query.
function installGoogleMock() {
  const place = {
    id: "place-123",
    formattedAddress: "123 Main St, Springfield, IL 62704, USA",
    location: { lat: () => 39.7817, lng: () => -89.6501 },
    addressComponents: [
      { types: ["street_number"], longText: "123", shortText: "123" },
      { types: ["route"], longText: "Main St", shortText: "Main St" },
      { types: ["locality"], longText: "Springfield", shortText: "Springfield" },
      { types: ["administrative_area_level_1"], longText: "Illinois", shortText: "IL" },
      { types: ["postal_code"], longText: "62704", shortText: "62704" },
    ],
    fetchFields: vi.fn().mockResolvedValue(undefined),
  };
  const prediction = {
    placeId: "place-123",
    text: { toString: () => "123 Main St, Springfield, IL, USA" },
    toPlace: () => place,
  };
  (window as unknown as { google: unknown }).google = {
    maps: {
      places: {
        AutocompleteSessionToken: class {},
        AutocompleteSuggestion: {
          fetchAutocompleteSuggestions: vi.fn().mockResolvedValue({
            suggestions: [{ placePrediction: prediction }],
          }),
        },
      },
      Geocoder: class {
        geocode(_req: unknown, cb: (r: unknown[], s: string) => void) {
          cb(
            [
              {
                formatted_address: "Springfield, IL 62704, USA",
                place_id: "geo-1",
                geometry: { location: { lat: () => 39.78, lng: () => -89.65 } },
                address_components: [
                  { types: ["locality"], long_name: "Springfield", short_name: "Springfield" },
                  { types: ["administrative_area_level_1"], long_name: "Illinois", short_name: "IL" },
                  { types: ["postal_code"], long_name: "62704", short_name: "62704" },
                ],
              },
            ],
            "OK"
          );
        }
      },
    },
  };
  return { place, prediction };
}

function Harness({
  onValidityChange,
  onLocationDetailsChange,
  displayFormat,
}: {
  onValidityChange: (v: boolean) => void;
  onLocationDetailsChange: Cb;
  displayFormat?: "full" | "cityStateZip";
}) {
  const [value, setValue] = useState("");
  return (
    <LocationInput
      id="loc"
      label="Location"
      value={value}
      onChange={setValue}
      onValidityChange={onValidityChange}
      onLocationDetailsChange={onLocationDetailsChange}
      useCurrentLocationLabel="Use current location"
      locationErrorMessage="Couldn't detect your location"
      displayFormat={displayFormat}
    />
  );
}

describe("LocationInput — Google Places", () => {
  let validity: Mock;
  let details: Mock;

  beforeEach(() => {
    validity = vi.fn();
    details = vi.fn();
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-key");
    installGoogleMock();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as unknown as { google?: unknown }).google;
    vi.clearAllMocks();
  });

  const type = (text: string) => {
    const input = screen.getByPlaceholderText("Location");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: text } });
  };
  const lastDetails = (): LocationDetails | null => details.mock.calls.at(-1)?.[0] ?? null;

  it("suggests, and turns a selected suggestion into a validated structured location", async () => {
    render(
      <Harness
        onValidityChange={validity}
        onLocationDetailsChange={details}
      />
    );

    type("123 Main");
    const option = await screen.findByRole("button", { name: /123 Main St, Springfield/ });
    fireEvent.click(option);

    await waitFor(() => expect(lastDetails()?.source).toBe("autosuggest"));
    const d = lastDetails()!;
    expect(d.city).toBe("Springfield"); // city extracted
    expect(d.state).toBe("IL"); // state extracted (short)
    expect(d.postalCode).toBe("62704");
    expect(d.latitude).toBeCloseTo(39.7817);
    expect(d.longitude).toBeCloseTo(-89.6501);
    expect(d.precision).toBe("address");
    expect(validity).toHaveBeenLastCalledWith(true); // becomes valid → Continue can enable
  });

  it("current-location uses the Google geocoder and yields a coarse validated location", async () => {
    const getCurrentPosition = vi.fn((ok: (p: { coords: { latitude: number; longitude: number } }) => void) =>
      ok({ coords: { latitude: 39.78, longitude: -89.65 } })
    );
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });

    render(
      <Harness
        onValidityChange={validity}
        onLocationDetailsChange={details}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Use current location" }));

    await waitFor(() => expect(lastDetails()?.source).toBe("current_location"));
    expect(lastDetails()?.precision).toBe("city_estimate");
    expect(lastDetails()?.state).toBe("IL");
  });

  it("stays invalid for empty input and does not corrupt state on rapid re-selection", async () => {
    render(
      <Harness
        onValidityChange={validity}
        onLocationDetailsChange={details}
      />
    );
    expect(validity).not.toHaveBeenCalledWith(true); // empty never reports itself valid

    type("123 Main");
    const option = await screen.findByRole("button", { name: /Springfield/ });
    fireEvent.click(option);
    fireEvent.click(option); // rapid second tap on the same option
    await waitFor(() => expect(lastDetails()?.source).toBe("autosuggest"));
    expect(validity).toHaveBeenLastCalledWith(true);
  });
});

// The residence and treatment-area screens (Figma 1949:4322, 1949:4417) show
// only "City, ST ZIP" — never a street — while the precise place still travels
// to the backend in the structured details.
describe("LocationInput — cityStateZip display", () => {
  let validity: Mock;
  let details: Mock;

  beforeEach(() => {
    validity = vi.fn();
    details = vi.fn();
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-key");
    installGoogleMock();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as unknown as { google?: unknown }).google;
    vi.clearAllMocks();
  });

  const lastDetails = (): LocationDetails | null => details.mock.calls.at(-1)?.[0] ?? null;

  it("asks Google for places only and shows the selection as City, ST ZIP with the place kept", async () => {
    render(
      <Harness
        onValidityChange={validity}
        onLocationDetailsChange={details}
        displayFormat="cityStateZip"
      />
    );

    const locationInput = screen.getByPlaceholderText("Location");
    fireEvent.focus(locationInput);
    fireEvent.change(locationInput, { target: { value: "Spring" } });
    const option = await screen.findByRole("button", { name: /Springfield/ });
    expect(option).toHaveTextContent("123 Main St, Springfield, IL"); // the country suffix is dropped
    fireEvent.click(option);

    await waitFor(() => expect(lastDetails()?.source).toBe("autosuggest"));
    const d = lastDetails()!;
    expect(screen.getByPlaceholderText("Location")).toHaveValue("Springfield, IL 62704"); // no street shown
    expect(d.text).toBe("Springfield, IL 62704");
    expect(d.placeId).toBe("place-123"); // the precise place is still carried
    expect(d.latitude).toBeCloseTo(39.7817);
    expect(d.longitude).toBeCloseTo(-89.6501);
    expect(d.postalCode).toBe("62704");
    expect(d.precision).toBe("city_estimate");
    expect(validity).toHaveBeenLastCalledWith(true);

    const win = window as unknown as {
      google: { maps: { places: { AutocompleteSuggestion: { fetchAutocompleteSuggestions: Mock } } } };
    };
    const request = win.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions.mock.calls[0][0];
    expect(request.includedPrimaryTypes).toEqual(["(regions)"]); // ZIPs and cities, not addresses
  });

  it("leaves the full-address screens untouched", async () => {
    render(
      <Harness
        onValidityChange={validity}
        onLocationDetailsChange={details}
      />
    );

    const locationInput = screen.getByPlaceholderText("Location");
    fireEvent.focus(locationInput);
    fireEvent.change(locationInput, { target: { value: "123 Main" } });
    fireEvent.click(await screen.findByRole("button", { name: /123 Main St, Springfield, IL, USA/ }));

    await waitFor(() => expect(lastDetails()?.source).toBe("autosuggest"));
    expect(lastDetails()?.text).toBe("123 Main St, Springfield, IL, USA"); // the prediction, street included
    const win = window as unknown as {
      google: { maps: { places: { AutocompleteSuggestion: { fetchAutocompleteSuggestions: Mock } } } };
    };
    const request = win.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions.mock.calls[0][0];
    expect(request.includedPrimaryTypes).toBeUndefined();
  });
});

describe("LocationInput — graceful fallback when Google is unavailable", () => {
  let validity: Mock;
  let details: Mock;

  beforeEach(() => {
    validity = vi.fn();
    details = vi.fn();
    // No key → ensureGoogleServices() resolves false → genuinely unavailable.
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
    delete (window as unknown as { google?: unknown }).google;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("accepts free text as an explicitly unvalidated manual entry and lets the patient continue", async () => {
    const lastDetails = (): LocationDetails | null => details.mock.calls.at(-1)?.[0] ?? null;
    render(
      <Harness
        onValidityChange={validity}
        onLocationDetailsChange={details}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Location"), { target: { value: "742 Evergreen Terrace" } });

    await waitFor(() => expect(validity).toHaveBeenLastCalledWith(true)); // continue is possible
    const d = lastDetails()!;
    expect(d.source).toBe("manual"); // NOT falsely marked Google-validated
    expect(d.precision).toBe("unvalidated");
    expect(d.text).toBe("742 Evergreen Terrace");
    expect(d.latitude).toBeUndefined(); // never geocoded
  });
});

// A field with requirePostalCode — the residence — is valid only for a place
// that carries a ZIP, however it was reached, and says so when one is missing.
// The page is shown here as a parent keeping its own flag, seeded from what it
// restored, so the tests see what the page sees.
describe("LocationInput — required ZIP", () => {
  const ZIP_MESSAGE = "Please include a ZIP code.";

  function ZipPage({ initialValue = "", initiallyValid = false }: { initialValue?: string; initiallyValid?: boolean }) {
    const [value, setValue] = useState(initialValue);
    const [valid, setValid] = useState(initiallyValid);
    return (
      <>
        <LocationInput
          id="residence"
          label="Location"
          value={value}
          onChange={setValue}
          onValidityChange={setValid}
          useCurrentLocationLabel="Use current location"
          locationErrorMessage="Couldn't detect your location"
          displayFormat="cityStateZip"
          requirePostalCode
          postalCodeRequiredMessage={ZIP_MESSAGE}
        />
        <output data-testid="page-valid">{valid ? "valid" : "invalid"}</output>
      </>
    );
  }

  const pageValidity = () => screen.getByTestId("page-valid").textContent;
  const type = (text: string) => {
    const input = screen.getByPlaceholderText("Location");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: text } });
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    removeGooglePlacesMock();
  });

  describe("with Google", () => {
    beforeEach(() => vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-key"));

    it("accepts a picked place with a ZIP", async () => {
      installGooglePlacesMock({ suggestions: [SPRINGFIELD_62704] });
      render(<ZipPage />);

      type("Spring");
      fireEvent.click(await screen.findByRole("button", { name: /Springfield, IL/ }));

      await waitFor(() => expect(pageValidity()).toBe("valid"));
      expect(screen.getByPlaceholderText("Location")).toHaveValue("Springfield, IL 62704");
      expect(screen.queryByText(ZIP_MESSAGE)).not.toBeInTheDocument();
    });

    it("refuses a picked place without a ZIP, and says why", async () => {
      installGooglePlacesMock({ suggestions: [SANGAMON_COUNTY_NO_ZIP] });
      render(<ZipPage />);

      type("Sangamon");
      fireEvent.click(await screen.findByRole("button", { name: /Sangamon County/ }));

      expect(await screen.findByText(ZIP_MESSAGE)).toBeInTheDocument();
      await waitFor(() => expect(pageValidity()).toBe("invalid"));
    });

    it("accepts a current location with a ZIP, even over a restored place the page had not vouched for", async () => {
      installGooglePlacesMock({ suggestions: [], currentLocation: WINTER_GARDEN_34787 });
      render(<ZipPage initialValue="Winter Garden, FL 34787" />);

      fireEvent.click(screen.getByRole("button", { name: "Use current location" }));

      await waitFor(() => expect(pageValidity()).toBe("valid"));
    });

    it("refuses a current location without a ZIP, and says why", async () => {
      installGooglePlacesMock({ suggestions: [], currentLocation: SANGAMON_COUNTY_NO_ZIP });
      render(
        <ZipPage
          initialValue="Springfield, IL 62704"
          initiallyValid
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "Use current location" }));

      expect(await screen.findByText(ZIP_MESSAGE)).toBeInTheDocument();
      await waitFor(() => expect(pageValidity()).toBe("invalid"));
    });

    it("turns invalid as soon as a valid place is typed over", async () => {
      installGooglePlacesMock({ suggestions: [SPRINGFIELD_62704] });
      render(
        <ZipPage
          initialValue="Springfield, IL 62704"
          initiallyValid
        />
      );

      type("Springfield, IL 627");

      await waitFor(() => expect(pageValidity()).toBe("invalid"));
    });
  });

  describe("without Google (manual entry)", () => {
    beforeEach(() => vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", ""));

    it("refuses typed text without a ZIP, and says why", async () => {
      render(<ZipPage />);

      type("Springfield, IL");

      expect(await screen.findByText(ZIP_MESSAGE)).toBeInTheDocument();
      await waitFor(() => expect(pageValidity()).toBe("invalid"));
    });

    it("accepts typed text with a ZIP", async () => {
      render(<ZipPage />);

      type("Springfield, IL 62704");

      await waitFor(() => expect(pageValidity()).toBe("valid"));
      expect(screen.queryByText(ZIP_MESSAGE)).not.toBeInTheDocument();
    });
  });
});
