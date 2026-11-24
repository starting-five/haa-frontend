// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDubQrDisplayUrl, qrCodeForShortLink, withQrScanMarker } from "../dub-qr";

// Dub counts a visit as a QR scan (trigger "qr") only when the short link it
// receives carries `qr=1` — its middleware's detectQr() is exactly
// `searchParams.get("qr") === "1"` — and strips the marker before redirecting.
// The QR codes this app handed out encoded the bare short link, so every scan
// was recorded as an ordinary link click.

const SHORT_LINK = "https://go.beta.helpafteraccident.com/ada.okafor";

/** The short link a QR image URL encodes. */
const encodedLink = (qrImageUrl: string) => new URL(qrImageUrl).searchParams.get("url") ?? "";

describe("the link a QR code encodes", () => {
  it("is the short link marked as a scan", () => {
    expect(withQrScanMarker(SHORT_LINK)).toBe(`${SHORT_LINK}?qr=1`);
  });

  it("keeps the link's own query and fragment", () => {
    expect(withQrScanMarker(`${SHORT_LINK}?via=ada`)).toBe(`${SHORT_LINK}?via=ada&qr=1`);
    expect(withQrScanMarker(`${SHORT_LINK}#top`)).toBe(`${SHORT_LINK}?qr=1#top`);
  });

  it("marks it once, however often it is applied", () => {
    expect(withQrScanMarker(withQrScanMarker(SHORT_LINK))).toBe(`${SHORT_LINK}?qr=1`);
  });

  it("still carries the marker when the link has no scheme", () => {
    expect(withQrScanMarker("go.beta.helpafteraccident.com/ada")).toBe("go.beta.helpafteraccident.com/ada?qr=1");
  });
});

describe("the QR image URL", () => {
  it("encodes the marked short link, URL-encoded inside `url`", () => {
    const qr = buildDubQrDisplayUrl(SHORT_LINK);

    expect(qr.startsWith("https://api.dub.co/qr?url=")).toBe(true);
    // encoded, so the marker belongs to the short link rather than to the QR endpoint
    expect(qr).toContain(encodeURIComponent(`${SHORT_LINK}?qr=1`));
    expect(encodedLink(qr)).toBe(`${SHORT_LINK}?qr=1`);
    expect(new URL(qr).searchParams.get("qr")).toBeNull();
  });

  it("keeps the branded rendering options", () => {
    const params = new URL(buildDubQrDisplayUrl(SHORT_LINK)).searchParams;
    expect(params.get("size")).toBe("1200");
    expect(params.get("level")).toBe("H");
    expect(params.get("fgColor")).toBe("#CC007E");
    expect(params.get("hideLogo")).toBe("false");
  });

  it("does not change the short link itself — shared links stay ordinary links", () => {
    const link = SHORT_LINK;
    buildDubQrDisplayUrl(link);
    expect(link).not.toContain("qr=");
  });
});

describe("the QR handed out for a profile", () => {
  it("is rebuilt from the short link, not a stored URL without the marker", () => {
    const stored = `https://api.dub.co/qr?url=${encodeURIComponent(SHORT_LINK)}&size=1200`;
    expect(encodedLink(qrCodeForShortLink(SHORT_LINK, stored)!)).toBe(`${SHORT_LINK}?qr=1`);
  });

  it("falls back to what is stored only when there is no short link", () => {
    expect(qrCodeForShortLink(null, "https://api.dub.co/qr?url=x")).toBe("https://api.dub.co/qr?url=x");
    expect(qrCodeForShortLink("  ", null)).toBeNull();
  });
});

// Every screen and route that shows, stores or returns a QR code has to go
// through the helper. A second copy of the URL builder is how the route that
// stores qr_code_url kept producing codes without the marker.
describe("every QR path uses the one helper", () => {
  const srcRoot = path.resolve(__dirname, "../..");
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return name === "__tests__" ? [] : sourceFiles(full);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
    });
  const relative = (file: string) => path.relative(srcRoot, file).split(path.sep).join("/");

  it("builds a Dub QR URL nowhere but lib/dub-qr.ts", () => {
    const builders = sourceFiles(srcRoot)
      .filter((file) => relative(file) !== "lib/dub-qr.ts")
      .filter((file) => /\/qr\?url=|api\.dub\.co\/qr/.test(readFileSync(file, "utf8")));

    expect(builders.map(relative)).toEqual([]);
  });

  it("routes every screen and route that produces a QR through the helper", () => {
    const qrProducers = [
      "app/[locale]/ambassadors/onboarding/identity/page.tsx",
      "app/[locale]/ambassadors/onboarding/link/page.tsx",
      "components/ambassadors/share-it/share-it-screen.tsx",
      "app/api/ambassadors/link/route.ts",
      "app/api/ambassadors/profile/route.ts",
      "app/api/ambassadors/provision/route.ts",
    ];

    for (const file of qrProducers) {
      expect(readFileSync(path.join(srcRoot, file), "utf8"), file).toContain('from "@/lib/dub-qr"');
    }
  });
});
