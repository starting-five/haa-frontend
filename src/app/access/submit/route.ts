import { NextResponse } from "next/server";
import { resolveRequestOrigin } from "@/lib/request-origin";

const STAGING_GATE_COOKIE = "staging_access";

function safeInternalPath(path: string | null): string {
  if (!path || !path.startsWith("/")) {
    return "/";
  }

  if (path.startsWith("//")) {
    return "/";
  }

  return path;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const nextPath = safeInternalPath(String(formData.get("next") ?? "/"));
  const expected = process.env.STAGING_GATE_PASSWORD;
  // Behind Caddy the server's own binding is 0.0.0.0:3000, so the origin has to
  // come from what the client actually asked for, not from request.url.
  const origin = resolveRequestOrigin(request);
  const useSecureCookie = new URL(origin).protocol === "https:";

  if (!expected) {
    return NextResponse.redirect(new URL(nextPath, origin));
  }

  if (password !== expected) {
    const retryUrl = new URL("/access", origin);
    retryUrl.searchParams.set("error", "1");
    if (nextPath !== "/") {
      retryUrl.searchParams.set("next", nextPath);
    }
    return NextResponse.redirect(retryUrl);
  }

  const response = NextResponse.redirect(new URL(nextPath, origin));
  response.cookies.set({
    name: STAGING_GATE_COOKIE,
    value: "granted",
    httpOnly: true,
    sameSite: "lax",
    secure: useSecureCookie,
    path: "/",
  });

  return response;
}
