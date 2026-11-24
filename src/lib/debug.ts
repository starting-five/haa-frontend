/**
 * Whether a route may answer with its diagnostic block.
 *
 * `?debug=1` alone is not enough. The ambassador routes grew a debug mode that
 * any authenticated caller could switch on from the address bar, and it
 * returned the caller's stored profile, the resolved referral identity, which
 * environment variables were set, and the referral provider's own error bodies
 * relayed verbatim. None of that belongs in a deployed response.
 *
 * The deployment decides instead. `APP_ENV` is the same value the staging gate
 * reads, so nothing new has to be configured: DEV keeps the query parameter
 * working for developers, and every other environment ignores it entirely.
 *
 * Diagnostics that are worth having in production are logged server-side
 * instead, where they reach the operator and not the caller.
 */
export function isDebugEnabled(request: Request): boolean {
  if (!debugAllowedHere()) return false;

  try {
    return new URL(request.url).searchParams.get("debug") === "1";
  } catch {
    return false;
  }
}

/** Exported for the routes that build their own diagnostics lazily. */
export function debugAllowedHere(): boolean {
  const appEnv = (process.env.APP_ENV ?? "DEV").trim().toUpperCase();
  return appEnv === "DEV" || appEnv === "DEVELOPMENT" || appEnv === "TEST";
}
