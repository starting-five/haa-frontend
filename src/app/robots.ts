import type { MetadataRoute } from "next";

function shouldBlockCrawlers() {
  const appEnv = (process.env.APP_ENV ?? "DEV").toUpperCase();
  const isProdLike = appEnv === "PROD" || appEnv === "PRODUCTION";
  const isDevLike = appEnv === "DEV" || appEnv === "DEVELOPMENT";
  const isBetaLike = appEnv === "BETA";
  const isStagingGateEnabled = Boolean(process.env.STAGING_GATE_PASSWORD) && !isProdLike && !isDevLike;

  return isBetaLike || isStagingGateEnabled;
}

export default function robots(): MetadataRoute.Robots {
  if (shouldBlockCrawlers()) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
  };
}
