import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../messages/en.json";

// Which screen demands what, asserted against the screens themselves.
//
// A table of expected guards proves nothing on its own — it has to be checked
// against the real pages, or moving a guard and moving the table together would
// look like a pass. So the hook is spied on and every screen in the reordered
// stretch is rendered for real.

const requireSessionKey = vi.fn();
vi.mock("@/hooks/use-require-session-key", () => ({
  useRequireSessionKey: (key: string, fallback: string) => requireSessionKey(key, fallback),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/intake",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);
vi.mock("@/hooks/use-preload-images", () => ({ usePreloadImages: () => {} }));
vi.mock("next/image", () => ({ default: () => <span data-testid="next-image" /> }));
vi.mock("@/services/intake", () => ({
  startIntake: vi.fn(),
  getRegistrationStatus: vi.fn(),
  completeIntake: vi.fn(),
}));
vi.mock("@/components/location-input", () => ({ LocationInput: () => <div data-testid="location-input" /> }));

import PhonePage from "../phone/page";
import OtpPage from "../otp/page";
import VerifiedPage from "../verified/page";
import IncidentPage from "../incident/page";
import FaultPage from "../fault/page";
import DatePage from "../date/page";
import LocationPage from "../location/page";
import ReassurancePage from "../reassurance/page";
import RolePage from "../role/page";

/**
 * The chain, in order. Each screen names the answer the one before it stored,
 * so the only way in is through the front.
 */
const CHAIN: [string, React.ComponentType, string, string][] = [
  ["phone", PhonePage, "intake_firstName", "/intake"],
  ["otp", OtpPage, "intake_phone", "/intake/phone"],
  ["verified", VerifiedPage, "intake_submissionId", "/intake/phone"],
  ["incident", IncidentPage, "intake_submissionId", "/intake/phone"],
  ["fault", FaultPage, "intake_incidentType", "/intake/incident"],
  ["date", DatePage, "intake_incidentType", "/intake/incident"],
  ["location", LocationPage, "intake_incidentDate", "/intake/date"],
  ["reassurance", ReassurancePage, "intake_incidentLocation", "/intake/location"],
];

/**
 * Further down the flow, and only here because the reorder touched it: the
 * submission id used to prove the accident screens had been answered, and since
 * the case is opened at verification it no longer does. This screen guards on a
 * recovery answer instead.
 */
const LATER: [string, React.ComponentType, string, string][] = [
  ["role", RolePage, "intake_treatmentArea", "/intake/treatment-area"],
];

describe("every screen in the reordered stretch guards on its predecessor", () => {
  beforeEach(() => {
    requireSessionKey.mockReset();
    sessionStorage.clear();
  });

  for (const [name, Page, key, fallback] of [...CHAIN, ...LATER]) {
    it(`${name} requires ${key}`, () => {
      render(
        <NextIntlClientProvider
          locale="en"
          messages={en}
        >
          <Page />
        </NextIntlClientProvider>
      );
      expect(requireSessionKey).toHaveBeenCalledWith(key, fallback);
    });
  }

  it("the chain has no gap: every fallback is a screen earlier in the chain", () => {
    const order = ["/intake", ...CHAIN.map(([name]) => `/intake/${name}`)];
    for (const [name, , , fallback] of CHAIN) {
      const here = order.indexOf(`/intake/${name}`);
      const back = order.indexOf(fallback);
      expect(back, `${name} falls back to ${fallback}, which is not in the chain`).toBeGreaterThanOrEqual(0);
      expect(back, `${name} falls back to a screen that comes after it`).toBeLessThan(here);
    }
  });
});
