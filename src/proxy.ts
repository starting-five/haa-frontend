import createIntlMiddleware from "next-intl/middleware";
import { updateSession } from "@/lib/supabase/proxy";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);
const STAGING_GATE_COOKIE = "staging_access";
const DUB_ID_COOKIE = "dub_click_id";
const DUB_VIA_COOKIE = "dub_via";
const DUB_ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function normalizeAttributionValue(input: string | null): string | null {
  if (!input) return null;
  const normalized = input.trim();
  if (!normalized) return null;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(normalized)) return null;
  return normalized;
}

/**
 * Whether the attribution cookies may carry the Secure attribute.
 *
 * Secure is what we want everywhere that can honour it, and it was set
 * unconditionally — which silently broke attribution on the plain-HTTP test
 * host, because the browser discards a Secure cookie sent over http and
 * nothing reports it. It is decided from the scheme the request actually
 * arrived on, so https keeps Secure and http still works.
 *
 * `x-forwarded-proto` is read first because the containers are terminated by a
 * proxy and see http themselves. It is only trusted to *enable* Secure, never
 * to disable it: a forged header can make a cookie stricter, never weaker.
 */
function attributionCookieIsSecure(request: NextRequest): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded) return forwarded === "https";
  return request.nextUrl.protocol === "https:";
}

/**
 * Keeps the referral click the patient arrived through.
 *
 * Last click wins. The provider appends `dub_id` to every redirect it tracks,
 * so a new id always means a newer click, and it replaces the one held — the
 * cookie used to keep the first id for seven days, and a patient who had once
 * followed another ambassador's link, or a link from before a reset, was
 * credited to that ambassador instead of the one whose link they had just
 * used. `dub_via` belongs to the same click, so it is replaced with it, or
 * dropped when the new click carries none.
 *
 * A visit with no `dub_id` is not a click and changes nothing.
 */
function applyDubAttributionCookies(request: NextRequest, response: NextResponse): NextResponse {
  const existingVia = request.cookies.get(DUB_VIA_COOKIE)?.value?.trim();

  const queryDubId = normalizeAttributionValue(request.nextUrl.searchParams.get("dub_id"));
  const queryVia = normalizeAttributionValue(request.nextUrl.searchParams.get("via"));

  const options = {
    httpOnly: true,
    secure: attributionCookieIsSecure(request),
    sameSite: "lax" as const,
    path: "/",
    maxAge: DUB_ATTRIBUTION_MAX_AGE_SECONDS,
  };

  if (queryDubId) {
    response.cookies.set(DUB_ID_COOKIE, queryDubId, options);
    if (queryVia) {
      response.cookies.set(DUB_VIA_COOKIE, queryVia, options);
    } else if (existingVia) {
      response.cookies.set(DUB_VIA_COOKIE, "", { ...options, maxAge: 0 });
    }
    return response;
  }

  if (!existingVia && queryVia) {
    response.cookies.set(DUB_VIA_COOKIE, queryVia, options);
  }

  return response;
}

function isStagingGateEnabled() {
  const appEnv = (process.env.APP_ENV ?? "DEV").toUpperCase();
  const isProdLike = appEnv === "PROD" || appEnv === "PRODUCTION";
  const isDevLike = appEnv === "DEV" || appEnv === "DEVELOPMENT";
  const isBetaLike = appEnv === "BETA";

  if (isBetaLike) {
    return false;
  }

  return Boolean(process.env.STAGING_GATE_PASSWORD) && !isProdLike && !isDevLike;
}

// lawyer onboarding and the portal aren't ready for users yet — treat their
// routes as if they don't exist rather than exposing an unfinished flow
const BLOCKED_ROUTE_PATTERN = /\/(onboarding\/lawyer|portal)(\/|$)/;

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const search = request.nextUrl.search;
  const gateEnabled = isStagingGateEnabled();
  const segments = pathname.split("/").filter(Boolean);
  const hasLocalePrefix = routing.locales.includes(segments[0] as (typeof routing.locales)[number]);
  const isCanonicalAccessPath = pathname === "/access" || pathname.startsWith("/access/");
  const isLocalizedAccessPath = hasLocalePrefix && segments[1] === "access";

  if (isLocalizedAccessPath) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.pathname = `/${segments.slice(1).join("/")}`;
    return applyDubAttributionCookies(request, NextResponse.redirect(canonicalUrl));
  }

  if (!gateEnabled && isCanonicalAccessPath) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return applyDubAttributionCookies(request, NextResponse.redirect(homeUrl));
  }

  // ECS health checks must bypass auth and locale routing
  if (pathname === "/health") {
    return applyDubAttributionCookies(request, NextResponse.next());
  }

  // robots.txt has to stay reachable and unmodified. Behind the gate it is
  // redirected to /access, and once past the gate the locale and Supabase
  // session handling rewrite it into a malformed body -- so the file whose whole
  // job is to tell crawlers to stay away was itself unreadable. It exposes no
  // data, so serving it ahead of all of that is both safe and necessary.
  if (pathname === "/robots.txt") {
    return applyDubAttributionCookies(request, NextResponse.next());
  }

  if (gateEnabled && !isCanonicalAccessPath) {
    const isAuthorized = request.cookies.get(STAGING_GATE_COOKIE)?.value === "granted";

    if (!isAuthorized) {
      const accessUrl = request.nextUrl.clone();
      accessUrl.pathname = "/access";
      accessUrl.search = "";

      const requestedPath = `${pathname}${search}`;
      if (requestedPath && requestedPath !== "/") {
        accessUrl.searchParams.set("next", requestedPath);
      }

      return applyDubAttributionCookies(request, NextResponse.redirect(accessUrl));
    }
  }

  if (BLOCKED_ROUTE_PATTERN.test(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/not-available";
    return applyDubAttributionCookies(request, NextResponse.rewrite(url));
  }

  // Referral links can choose the locale, including when a link already has
  // the other locale prefix. Keep every query parameter on the redirect.
  const utmSource = request.nextUrl.searchParams.get("utm_source")?.trim();
  if (!isCanonicalAccessPath && utmSource) {
    const locale = /-s$/i.test(utmSource) ? "es" : "en";
    const currentLocale = hasLocalePrefix ? segments[0] : null;

    if (currentLocale !== locale) {
      const localizedUrl = request.nextUrl.clone();
      localizedUrl.pathname = hasLocalePrefix
        ? `/${[locale, ...segments.slice(1)].join("/")}`
        : pathname === "/"
          ? `/${locale}`
          : `/${locale}${pathname}`;
      return applyDubAttributionCookies(request, NextResponse.redirect(localizedUrl));
    }
  }

  // Refresh Supabase session cookies and check auth
  const supabaseResponse = await updateSession(request);

  // If Supabase is redirecting (e.g. unauthenticated user), let it through
  if (supabaseResponse.status === 301 || supabaseResponse.status === 302 || supabaseResponse.status === 307) {
    return applyDubAttributionCookies(request, supabaseResponse);
  }

  // Keep the password gate route outside locale redirects.
  if (isCanonicalAccessPath) {
    return applyDubAttributionCookies(request, supabaseResponse);
  }

  // Handle locale routing
  const intlResponse = intlMiddleware(request);

  // Copy refreshed Supabase auth cookies onto the intl response
  supabaseResponse.cookies.getAll().forEach(({ name, value, ...options }) => {
    intlResponse.cookies.set(name, value, options);
  });

  return applyDubAttributionCookies(request, intlResponse);
}

export const config = {
  matcher: [
    "/((?!api(?:/|$)|health(?:/|$)|robots\\.txt$|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
