import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";
import { resolveAmbassadorLinkHost } from "./src/lib/ambassador-link-host";

function isStagingGateEnabled() {
  const appEnv = (process.env.APP_ENV ?? "DEV").toUpperCase();
  const isProdLike = appEnv === "PROD" || appEnv === "PRODUCTION";
  const isDevLike = appEnv === "DEV" || appEnv === "DEVELOPMENT";

  return Boolean(process.env.STAGING_GATE_PASSWORD) && !isProdLike && !isDevLike;
}

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  allowedDevOrigins: ["192.168.4.117"],
  headers: async () => {
    // The design renders under /assets are served as-is, so the browser must be
    // allowed to keep them: without this Next answers max-age=0 and every screen
    // revalidates its illustration before it can paint it. A changed asset gets a
    // new file name, which is why a week is safe.
    const assetCaching = {
      source: "/assets/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" }],
    };

    if (!isStagingGateEnabled()) {
      return [assetCaching];
    }

    return [
      assetCaching,
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet, noimageindex",
          },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin();

// NEXT_PUBLIC_* values are compiled into the bundle by `next build` (and served
// by `next dev`), so a value missing here is missing for good: the image would
// build and the ambassador screens would fail in the patient's browser. The
// build is refused instead, with the variable named. `next start` serves a
// bundle that already carries it, and is not checked.
export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD || phase === PHASE_DEVELOPMENT_SERVER) {
    resolveAmbassadorLinkHost(process.env.NEXT_PUBLIC_AMBASSADOR_LINK_HOST);
  }
  return withNextIntl(nextConfig);
}
