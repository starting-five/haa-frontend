import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../messages/en.json";

// The name screen restores what was typed before, and must do it without the
// server and the browser drawing different first frames. The server has no
// sessionStorage; reading it during render drew empty fields there and filled
// ones in the browser, and React threw the page away with a hydration error
// (React #418 on Beta, for a patient coming back to the start of the intake).

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

import NamePage from "../page";

const page = () => (
  <NextIntlClientProvider
    locale="en"
    messages={en}
  >
    <NamePage />
  </NextIntlClientProvider>
);

const field = (id: string) => document.getElementById(id) as HTMLInputElement | null;

describe("name screen", () => {
  beforeEach(() => sessionStorage.clear());

  it("draws the same first frame whether or not a name was saved", () => {
    const withoutSaved = renderToString(page());
    sessionStorage.setItem("intake_firstName", "Reva");
    sessionStorage.setItem("intake_lastName", "Lin");
    const withSaved = renderToString(page());

    expect(withSaved).toBe(withoutSaved);
  });

  it("shows the saved name once it has mounted", async () => {
    sessionStorage.setItem("intake_firstName", "Reva");
    sessionStorage.setItem("intake_lastName", "Lin");
    render(page());

    await waitFor(() => expect(field("firstName")?.value).toBe("Reva"));
    expect(field("lastName")?.value).toBe("Lin");
  });
});
