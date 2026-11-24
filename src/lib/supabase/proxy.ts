import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_CODES } from "../../i18n/locales";
import { appFlowForPath } from "../app-flow";
import { hasEnvVars } from "../utils";

/**
 * Screens a patient who is already signed in has no business being on.
 *
 * `/intake`, `/intake/phone` and `/intake/otp` are intentionally excluded:
 * an authenticated patient can still have an unfinished intake (status intake/
 * in_progress), and resuming that flow starts from those routes. The backend
 * still enforces one claimant and one open submission, so allowing re-entry
 * cannot create duplicates.
 */
const AUTHENTICATED_PATIENT_REDIRECT_ROUTES = new Set(["get-help", "intake/splash", "intake/help-is-on-the-way"]);

// OTP signs the ambassador in before onboarding is complete. These are the
// post-auth continuation steps, so they must stay reachable while still
// keeping early acquisition/onboarding entry points dashboard-bound.
const AMBASSADOR_ONBOARDING_CONTINUATION_STEPS = new Set([
  "link",
  "you-are-live",
  "first-steps",
  "introduce-yourself",
  "share-it",
]);

type AmbassadorLookupClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string
      ) => {
        maybeSingle: () => PromiseLike<{ data: { user_id?: string } | null; error: unknown }>;
      };
    };
  };
};

async function isAmbassadorUser(supabase: AmbassadorLookupClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("ambassador_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return false;
  return Boolean(data?.user_id);
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // If the env vars are not set, skip proxy check. You can remove this
  // once you setup the project.
  if (!hasEnvVars) {
    return supabaseResponse;
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    }
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const pathname = request.nextUrl.pathname;
  // "/" or a bare locale root (e.g. "/en") — the latter redirects onward to /get-help itself
  const segments = pathname.split("/").filter(Boolean);
  const isLocaleRoot = segments.length === 1 && LOCALE_CODES.includes(segments[0]);
  const isAccessRoute =
    pathname === "/access" ||
    pathname.startsWith("/access/") ||
    (segments.length >= 2 && LOCALE_CODES.includes(segments[0]) && segments[1] === "access");
  const isLocalePrefixed = segments.length >= 2 && LOCALE_CODES.includes(segments[0]);
  const isPatientLoginRoute = isLocalePrefixed && segments[1] === "patient" && segments[2] === "login";
  const isAmbassadorLoginRoute = isLocalePrefixed && segments[1] === "ambassadors" && segments[2] === "login";
  const isAmbassadorDashboardRoute = isLocalePrefixed && segments[1] === "ambassadors" && segments[2] === "dashboard";
  const isAmbassadorOnboardingRoute = isLocalePrefixed && segments[1] === "ambassadors" && segments[2] === "onboarding";
  const isAmbassadorOnboardingContinuationRoute =
    isAmbassadorOnboardingRoute && AMBASSADOR_ONBOARDING_CONTINUATION_STEPS.has(segments[3] ?? "");
  const isAmbassadorAcquisitionRoute =
    isLocalePrefixed &&
    segments[1] === "ambassadors" &&
    (!segments[2] ||
      segments[2] === "language-selector" ||
      segments[2] === "get-started" ||
      (segments[2] === "onboarding" && !isAmbassadorOnboardingContinuationRoute));
  const isPatientOwnedRoute =
    isLocalePrefixed &&
    ((segments[1] === "intake" &&
      [
        "agreement",
        "attorney",
        "choose-attorney",
        "connected",
        "dashboard",
        "doctor",
        "hire-attorney",
        "you-are-connected",
      ].includes(segments[2] ?? "")) ||
      segments[1] === "case");
  const localeRoute = segments.slice(1).join("/");
  const shouldRedirectAuthenticatedPatient = isLocalePrefixed && AUTHENTICATED_PATIENT_REDIRECT_ROUTES.has(localeRoute);
  // The route decides the flow (lib/app-flow.ts), never the account: a number
  // that is both a patient and an ambassador is one Supabase user holding both,
  // so the ambassador profile is consulted only inside the ambassador flow. A
  // patient-flow route is handled as the patient's whatever else the account is.
  const isAmbassadorFlow = appFlowForPath(pathname) === "ambassador";
  const isPublicRoute =
    pathname === "/" ||
    isLocaleRoot ||
    isAccessRoute ||
    isPatientLoginRoute ||
    pathname.includes("/auth") ||
    pathname.includes("/get-help") ||
    pathname.includes("/intake") ||
    pathname.includes("/onboarding") ||
    pathname.includes("/review") ||
    pathname.includes("/case") ||
    pathname.includes("/portal") ||
    pathname.includes("/ambassadors") ||
    pathname.includes("/doctors") ||
    pathname.includes("/lawyers");

  if (!user && isAmbassadorDashboardRoute) {
    const url = request.nextUrl.clone();
    const locale = segments[0] || "en";
    url.pathname = `/${locale}/ambassadors/login`;
    return NextResponse.redirect(url);
  }

  if (!user && isPatientOwnedRoute) {
    const url = request.nextUrl.clone();
    const locale = segments[0] || "en";
    url.pathname = `/${locale}/patient/login`;
    return NextResponse.redirect(url);
  }

  if (
    user &&
    isAmbassadorFlow &&
    (isAmbassadorAcquisitionRoute || isAmbassadorLoginRoute || isAmbassadorDashboardRoute)
  ) {
    const ambassador = await isAmbassadorUser(supabase as unknown as AmbassadorLookupClient, String(user.sub ?? ""));
    if (ambassador && (isAmbassadorAcquisitionRoute || isAmbassadorLoginRoute)) {
      const url = request.nextUrl.clone();
      const locale = segments[0] || "en";
      url.pathname = `/${locale}/ambassadors/dashboard`;
      return NextResponse.redirect(url);
    }
    if (!ambassador && isAmbassadorDashboardRoute) {
      const url = request.nextUrl.clone();
      const locale = segments[0] || "en";
      url.pathname = `/${locale}/ambassadors/login`;
      return NextResponse.redirect(url);
    }
  }

  if (user && shouldRedirectAuthenticatedPatient) {
    const url = request.nextUrl.clone();
    const locale = segments[0] || "en";
    url.pathname = `/${locale}/intake/dashboard`;
    return NextResponse.redirect(url);
  }

  if (!user && !isPublicRoute) {
    // Redirect unauthenticated users to the locale-prefixed login page
    const url = request.nextUrl.clone();
    const locale = pathname.split("/")[1] || "en";
    url.pathname = `/${locale}/auth/login`;
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
