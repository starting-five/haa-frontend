import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import es from "../../../../messages/es.json";
import { IntakeTransition } from "@/components/intake/intake-transition";

// The Patient Flow offers no back action on any screen. The header's back
// control is opt-in (ScreenHeader showBack), and it has come back twice: once
// kept for the language chooser and once on a page restored from an older copy.
// This pins the rule at the source for every Patient Flow file, and at render
// for representative screens in both languages, with the logo's home link kept.

const nav = vi.hoisted(() => ({ locale: "en" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/intake",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: nav.locale }),
}));
// the header this page renders builds a Supabase client and watches auth state
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);
vi.mock("@/hooks/use-require-session-key", () => ({ useRequireSessionKey: () => {} }));

import GetHelpPage from "../get-help/page";
import IntakeNamePage from "../intake/page";
import IntakeInjuryTypePage from "../intake/injury-type/page";
import SplashPage from "../intake/splash/page";

// The runner starts at the project root; a wrong root fails loudly (ENOENT) rather than scanning nothing,
// and the arrayContaining check below proves the known Patient Flow pages were read.
const SRC = path.resolve(process.cwd(), "src");

// Every route the Patient Flow owns, and the shared screens those routes render.
const PATIENT_FLOW_DIRS = [
  "app/[locale]/get-help",
  "app/[locale]/intake",
  "app/[locale]/patient",
  "app/[locale]/case",
  "components/intake",
  "components/name",
  "components/phone",
  "components/otp",
  "components/language",
];

const sourceFiles = (dir: string): string[] =>
  readdirSync(path.join(SRC, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(relative);
    return /\.tsx?$/.test(entry.name) ? [relative] : [];
  });

describe("Patient Flow back control", () => {
  it("no Patient Flow screen or shared screen opts into a back control", () => {
    const files = PATIENT_FLOW_DIRS.flatMap(sourceFiles);
    const offenders = files.filter((file) =>
      /\bshowBack\b|\b(router|history)\.back\(/.test(readFileSync(path.join(SRC, file), "utf8"))
    );

    expect(files).toEqual(
      expect.arrayContaining([
        path.join("app/[locale]/get-help", "page.tsx"),
        path.join("app/[locale]/intake/injury-type", "page.tsx"),
        path.join("app/[locale]/intake/dashboard", "page.tsx"),
        path.join("app/[locale]/patient/login", "page.tsx"),
      ])
    );
    expect(offenders).toEqual([]);
  });

  const screens = [
    ["get-help", () => <GetHelpPage />],
    ["intake/splash", () => <SplashPage />],
    ["intake (name)", () => <IntakeNamePage />],
    ["intake/injury-type", () => <IntakeInjuryTypePage />],
    [
      "an interstitial with its header",
      () => (
        <IntakeTransition
          heading="Get what you deserve."
          nextPath="/en/intake/evidence"
          showHeader
        />
      ),
    ],
  ] as const;

  describe.each([
    ["en", en],
    ["es", es],
  ] as const)("in %s", (locale, messages) => {
    // the name screen mounts once it has asked who is signed in, so the header is
    // waited for rather than expected on the first frame
    it.each(screens)("%s renders no back control and keeps the home link", async (_name, Screen) => {
      nav.locale = locale;
      render(
        <NextIntlClientProvider
          locale={locale}
          messages={messages}
        >
          <Screen />
        </NextIntlClientProvider>
      );

      expect(await screen.findByRole("link", { name: messages.ScreenHeader.homeLabel })).toHaveAttribute(
        "href",
        `/${locale}`
      );
      expect(screen.queryByRole("button", { name: messages.ScreenHeader.back })).not.toBeInTheDocument();
    });
  });
});
