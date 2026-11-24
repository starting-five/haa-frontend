import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      signOut: vi.fn(async () => ({ error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/intake/doctor",
}));

import { ProviderScreen } from "@/components/providers/provider-screen";
import { PLACEHOLDER_ATTORNEY, PLACEHOLDER_DOCTOR } from "@/lib/providers";

const renderScreen = (kind: "attorney" | "doctor") =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={en}
    >
      <ProviderScreen
        kind={kind}
        provider={kind === "attorney" ? PLACEHOLDER_ATTORNEY : PLACEHOLDER_DOCTOR}
      />
    </NextIntlClientProvider>
  );

afterEach(() => {
  nav.push.mockReset();
});

describe("ProviderScreen", () => {
  it("shows the attorney heading and firm name (Figma 4181:5101)", () => {
    renderScreen("attorney");
    expect(screen.getByRole("heading", { name: "Your attorney" })).toBeInTheDocument();
    expect(screen.getByText("Louis Berk Injury & Trial Attorneys")).toBeInTheDocument();
  });

  it("shows the doctor heading and practice name (Figma 4200:12992)", () => {
    renderScreen("doctor");
    expect(screen.getByRole("heading", { name: "Your doctor" })).toBeInTheDocument();
    expect(screen.getByText("Bay Area Injury & Rehabilitation")).toBeInTheDocument();
  });

  it("opens the details popup from the details card, closed by default", () => {
    renderScreen("attorney");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Attorney details" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-label", "Attorney details");
    // The four rows Figma 4182:5033 draws.
    expect(within(dialog).getByText(/326 N\. Magnolia Avenue\s*Floor 2\s*Orlando FL 32801/i)).toBeInTheDocument();
    expect(within(dialog).getByText("intakes@louisberklaw.com")).toBeInTheDocument();
    expect(within(dialog).getByText("louisberklaw.com")).toBeInTheDocument();
  });

  it("renders the phone row as plain text, not a phone link", () => {
    renderScreen("attorney");
    fireEvent.click(screen.getByRole("button", { name: "Attorney details" }));
    const dialog = screen.getByRole("dialog");
    const phoneRow = within(dialog).getByText("(407) 906-0500");
    // Calling lives on the provider screen action row, not in this modal.
    expect(phoneRow.closest("a")).toBeNull();
  });

  it("shows the doctor popup's own website value with the design's capitalisation", () => {
    renderScreen("doctor");
    fireEvent.click(screen.getByRole("button", { name: "Doctor details" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Yourdoctor.com")).toBeInTheDocument();
  });

  it("returns to the dashboard from the footer CTA, preserving locale", () => {
    renderScreen("attorney");
    fireEvent.click(screen.getByRole("button", { name: "Go to dashboard" }));
    expect(nav.push).toHaveBeenCalledWith("/en/intake/dashboard");
  });

  it("keeps Call as a tel link on the screen (distinct from the fax row)", () => {
    renderScreen("doctor");
    const call = screen.getByText("Call").closest("a");
    expect(call).toHaveAttribute("href", "tel:4085550199");
  });
});
