// The one place an ambassador's QR code is built. Every screen and route that
// shows, stores or shares a QR goes through here, so they all encode the same
// URL — and the identity page's prefetch hits Dub's cached QR image because the
// URL matches exactly.
//
// A QR code encodes the short link *marked as a scan*: Dub records a visit as
// a QR scan (trigger "qr") only when the short link carries `qr=1`, and as an
// ordinary link click otherwise. It strips the marker before redirecting, so
// the patient never sees it. Codes printed or shared before the marker was
// added still count as link clicks; only newly generated ones count as scans.
// The plain short link — the one copied or shared as text — never carries it.

const DUB_QR_IMAGE_ENDPOINT = "https://api.dub.co/qr";
const QR_SCAN_PARAM = "qr";

/** The short link as a QR code must encode it, so that Dub counts the visit as a scan. */
export function withQrScanMarker(shortLink: string): string {
  try {
    const url = new URL(shortLink);
    url.searchParams.set(QR_SCAN_PARAM, "1");
    return url.toString();
  } catch {
    // Not an absolute URL; the marker still has to reach Dub.
    const [withoutHash, hash = ""] = shortLink.split("#", 2);
    const separator = withoutHash.includes("?") ? "&" : "?";
    return `${withoutHash}${separator}${QR_SCAN_PARAM}=1${hash ? `#${hash}` : ""}`;
  }
}

/** The branded QR image for an ambassador's short link. */
export function buildDubQrDisplayUrl(shortLink: string): string {
  return `${DUB_QR_IMAGE_ENDPOINT}?url=${encodeURIComponent(withQrScanMarker(shortLink))}&size=1200&level=H&fgColor=%23CC007E&hideLogo=false`;
}

/**
 * The QR image to hand out for a profile: always rebuilt from its short link
 * when there is one, so a URL stored before the scan marker existed — or the
 * provider's own, differently styled one — is never served in its place.
 */
export function qrCodeForShortLink(shortLink: string | null | undefined, stored?: string | null): string | null {
  const link = shortLink?.trim();
  if (link) return buildDubQrDisplayUrl(link);
  return stored ?? null;
}
