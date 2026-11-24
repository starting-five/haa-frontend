import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

const AUTHENTICATED_PATIENT_REDIRECT_ROUTES = new Set([
  "get-help",
  "intake",
  "intake/splash",
  "intake/help-is-on-the-way",
  "intake/incident",
  "intake/fault",
  "intake/date",
  "intake/confirm-date",
  "intake/location",
  "intake/phone",
  "intake/otp",
]);

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // ECS health checks must bypass Supabase authentication.
  if (request.nextUrl.pathname === "/health") {
    return supabaseResponse;
  }

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
  const segments = pathname.split("/").filter(Boolean);
  const isLocalePrefixed = segments.length >= 2 && ["en", "es"].includes(segments[0]);
  const isPatientLoginRoute = isLocalePrefixed && segments[1] === "patient" && segments[2] === "login";
  const isPatientOwnedRoute =
    isLocalePrefixed &&
    ((segments[1] === "intake" &&
      ["agreement", "connected", "dashboard", "you-are-connected"].includes(segments[2] ?? "")) ||
      segments[1] === "case");
  const localeRoute = segments.slice(1).join("/");
  const shouldRedirectAuthenticatedPatient = isLocalePrefixed && AUTHENTICATED_PATIENT_REDIRECT_ROUTES.has(localeRoute);
  const isPublicRoute =
    pathname === "/" ||
    isPatientLoginRoute ||
    pathname.includes("/auth") ||
    pathname.includes("/get-help") ||
    pathname.includes("/intake") ||
    pathname.includes("/case") ||
    pathname.includes("/portal");

  if (!user && isPatientOwnedRoute) {
    const url = request.nextUrl.clone();
    const locale = segments[0] || "en";
    url.pathname = `/${locale}/patient/login`;
    return NextResponse.redirect(url);
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
