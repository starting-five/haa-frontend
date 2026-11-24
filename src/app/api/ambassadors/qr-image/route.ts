import { NextRequest, NextResponse } from "next/server";

// The QR PNG is served cross-origin by Dub, so the browser can display it in an
// <img> tag but cannot reliably fetch() its bytes (CORS) to build a share File.
// Proxying it same-origin sidesteps that entirely. Restricted to Dub's host so
// this can't be used as an open image proxy — checked by origin, not an exact
// query string, since Dub's own qrCode responses can vary in query shape.
const ALLOWED_HOST = "api.dub.co";
const ALLOWED_PATH_PREFIX = "/qr";

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url") ?? "";

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== ALLOWED_HOST ||
    !parsed.pathname.startsWith(ALLOWED_PATH_PREFIX)
  ) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  const url = parsed.toString();

  let upstream: Response;
  try {
    upstream = await fetch(url, { cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "upstream_failed" }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/png",
      "Cache-Control": "private, max-age=300",
    },
  });
}
