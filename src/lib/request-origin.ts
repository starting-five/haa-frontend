/**
 * Resolves the origin a client actually used, rather than the address the server
 * happens to be bound to.
 *
 * `new URL(request.url).origin` is the obvious thing to reach for and it is wrong
 * behind a reverse proxy. The standalone Next server listens on HOSTNAME=0.0.0.0
 * and PORT=3000, and derives `request.url` from that binding, so on the deployed
 * TEST environment it produced `https://0.0.0.0:3000` — a redirect to that lands
 * the visitor on a browser error page. Confirmed against the running container:
 * posting with `Host: haaaaaaaa.com` still returned `Location: http://0.0.0.0:3000/…`.
 *
 * Caddy sits in front and sets the X-Forwarded-* headers, so those are the
 * authoritative source for what the browser asked for. The Host header is used
 * next, because a direct request without a proxy still carries the right host.
 * `request.url` is only the last resort, which keeps this working in tests and
 * local development where no proxy is involved.
 *
 * No domain is hardcoded: the same code serves localhost, the TEST domain and
 * production without configuration.
 */
export function resolveRequestOrigin(request: Request): string {
  const headers = request.headers;
  const requestUrl = new URL(request.url);

  // X-Forwarded-Host may carry a comma-separated list when several proxies are
  // chained; the first entry is the one the client used.
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headers.get("host")?.trim() || requestUrl.host;

  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || requestUrl.protocol.replace(":", "");

  return `${protocol}://${host}`;
}
