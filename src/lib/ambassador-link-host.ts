// The host ambassador referral links are shown under, e.g. "go.helpafteraccident.com".
//
// It is NEXT_PUBLIC_AMBASSADOR_LINK_HOST, which Next.js compiles into the
// browser bundle when the app is built: setting it on a running container does
// nothing. Each environment's links live on its own Dub domain (the server's
// DUB_AMBASSADOR_LINK_DOMAIN), so there is no safe default — a build without it
// is refused in next.config.ts rather than shipping screens that cannot render.
//
// Kept free of any Next or React import so next.config.ts can use it.

export const AMBASSADOR_LINK_HOST_VAR = "NEXT_PUBLIC_AMBASSADOR_LINK_HOST";

// a host name, optionally with a port: letters, digits, dots and hyphens
const HOST_PATTERN =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*(?::\d{1,5})?$/i;

/**
 * The configured host, without a scheme or trailing slash. Throws, naming the
 * variable, when it is missing or is not a bare host (a path, a query, spaces).
 */
export function resolveAmbassadorLinkHost(value: string | undefined): string {
  const host = (value ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  if (!host) {
    throw new Error(
      `Missing required env var ${AMBASSADOR_LINK_HOST_VAR}: set it to the ambassador link host (e.g. go.helpafteraccident.com) when the app is built — it is compiled into the bundle.`
    );
  }
  if (!HOST_PATTERN.test(host)) {
    throw new Error(`${AMBASSADOR_LINK_HOST_VAR} must be a bare host such as go.helpafteraccident.com, got "${host}"`);
  }
  return host;
}
