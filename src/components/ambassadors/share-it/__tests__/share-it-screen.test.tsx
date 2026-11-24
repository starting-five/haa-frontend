import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../messages/en.json";

// The QR code an ambassador shares must encode their short link marked as a
// scan (`?qr=1`), or Dub records every scan as an ordinary link click. The link
// they share as text is the plain short link: it is an ordinary click.

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/ambassadors/dashboard/share-it",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);
vi.mock("next/image", () => ({
  default: () => <span data-testid="next-image" />,
}));

import { ShareItScreen } from "../share-it-screen";

const SHORT_LINK = "https://go.beta.helpafteraccident.com/ada.okafor";
const fetchMock = vi.fn();

/** The short link a Dub QR image URL encodes. */
const encodedLink = (qrImageUrl: string) => new URL(qrImageUrl).searchParams.get("url");

const renderScreen = () =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={en}
    >
      <ShareItScreen variant="dashboard" />
    </NextIntlClientProvider>
  );

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem("onboarding_ambassador_shortLink", SHORT_LINK);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
    String(input).startsWith("/api/ambassadors/profile")
      ? Response.json({ shortLink: SHORT_LINK }, { status: 200 })
      : new Response(null, { status: 404 })
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Share It — the QR code", () => {
  it("shows a QR that encodes the short link marked as a scan", async () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: en.AmbassadorShare.qrCode }));

    const qr = (await screen.findByAltText(en.AmbassadorShare.qrCode)) as HTMLImageElement;
    expect(encodedLink(qr.src)).toBe(`${SHORT_LINK}?qr=1`);
  });

  it("fetches the same marked QR for the file it shares", async () => {
    renderScreen();

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/ambassadors/qr-image"))).toBe(true)
    );
    const proxied = fetchMock.mock.calls
      .map(([input]) => String(input))
      .find((input) => input.includes("/api/ambassadors/qr-image"))!;
    const qrImageUrl = new URL(proxied, "https://beta.example").searchParams.get("url")!;
    expect(encodedLink(qrImageUrl)).toBe(`${SHORT_LINK}?qr=1`);
  });

  it("ignores a stored QR without the marker when the short link is known", async () => {
    sessionStorage.setItem(
      "onboarding_ambassador_qrCode",
      `https://api.dub.co/qr?url=${encodeURIComponent(SHORT_LINK)}&size=600`
    );

    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: en.AmbassadorShare.qrCode }));

    const qr = (await screen.findByAltText(en.AmbassadorShare.qrCode)) as HTMLImageElement;
    expect(encodedLink(qr.src)).toBe(`${SHORT_LINK}?qr=1`);
  });
});

describe("Share It — the link", () => {
  it("shows and copies the plain short link, with no scan marker", async () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: en.AmbassadorShare.haaLink }));

    expect(await screen.findByText("go.beta.helpafteraccident.com/ada.okafor")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("ada.okafor?qr=1");
  });

  // On Muhammad Test, ambassador B signed in on a tab ambassador A had used without
  // logging out: Share It showed and copied A's link, because the tab's copy won
  // over the link the server holds for B. B's shares would have credited A.
  it("shows, copies and encodes the signed-in ambassador's stored link, not the tab's leftover", async () => {
    const previousAmbassadorLink = "https://go.beta.helpafteraccident.com/someone.else";
    sessionStorage.setItem("onboarding_ambassador_shortLink", previousAmbassadorLink);
    sessionStorage.setItem(
      "onboarding_ambassador_qrCode",
      `https://api.dub.co/qr?url=${encodeURIComponent(`${previousAmbassadorLink}?qr=1`)}`
    );
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    try {
      renderScreen();

      fireEvent.click(screen.getByRole("button", { name: en.AmbassadorShare.haaLink }));
      expect(await screen.findByText("go.beta.helpafteraccident.com/ada.okafor")).toBeInTheDocument();
      expect(screen.queryByText("go.beta.helpafteraccident.com/someone.else")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: en.AmbassadorShare.copyLink }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(SHORT_LINK));

      fireEvent.click(screen.getByRole("button", { name: en.AmbassadorShare.close }));
      fireEvent.click(screen.getByRole("button", { name: en.AmbassadorShare.qrCode }));
      const qr = (await screen.findByAltText(en.AmbassadorShare.qrCode)) as HTMLImageElement;
      expect(encodedLink(qr.src)).toBe(`${SHORT_LINK}?qr=1`);
      expect(sessionStorage.getItem("onboarding_ambassador_shortLink")).toBe(SHORT_LINK);
    } finally {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });
});
