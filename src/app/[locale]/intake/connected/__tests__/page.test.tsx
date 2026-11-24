import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en.json";

// "You're connected" is gated on a backend-confirmed agreement, and its CTA
// hands off to the "thanks" interstitial (Figma 3100-5083) — not straight to
// the dashboard, which now sits one transition later.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/intake/connected",
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));
// the header this page renders builds a Supabase client and watches auth state
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);
vi.mock("@/hooks/use-preload-images", () => ({ usePreloadImages: () => {} }));

let confirmed = false;
vi.mock("@/hooks/use-require-completed-agreement", () => ({
  useRequireCompletedAgreement: () => confirmed,
}));

import IntakeConnectedPage from "../page";

const renderPage = () =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
    >
      <IntakeConnectedPage />
    </NextIntlClientProvider>
  );

describe("connected", () => {
  beforeEach(() => {
    push.mockReset();
    confirmed = false;
  });

  it("renders nothing until the agreement is backend-confirmed", () => {
    renderPage();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("hands off to the thanks interstitial, not the dashboard, on its CTA", () => {
    confirmed = true;
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: messages.IntakeRetainerSigning.cta }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/en/intake/thanks");
  });
});
