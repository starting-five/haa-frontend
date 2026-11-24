import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../../messages/en.json";
import es from "../../../../../../../messages/es.json";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/ambassadors/onboarding/name",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);

import AmbassadorOnboardingNamePage from "../page";

const renderPage = (locale: "en" | "es") =>
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "es" ? es : en}
    >
      <AmbassadorOnboardingNamePage />
    </NextIntlClientProvider>
  );

describe("ambassador name fields", () => {
  it("labels the last name exactly as Figma 1226:2135 does", () => {
    renderPage("en");
    expect(screen.getByPlaceholderText("Last Name (Optional)")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("First Name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Preferred Name")).toBeInTheDocument();
  });

  it("keeps the same capitalisation in Spanish", () => {
    renderPage("es");
    expect(screen.getByPlaceholderText("Apellido (Opcional)")).toBeInTheDocument();
  });
});
