import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Start a new intake (intake/dashboard) goes ahead only when the tab no longer
// holds a Supabase session after signOut({ scope: "local" }). These pin that
// contract against the real browser client rather than a mock: the session
// cookie the proxy reads is gone after a completed logout, and also after a
// logout call that never reached the auth service.

const PROJECT = "abcdefghijklmnopqrst";
const COOKIE = `sb-${PROJECT}-auth-token`;

const sessionCookies = () =>
  document.cookie
    .split(";")
    .map((cookie) => cookie.trim().split("=")[0])
    .filter((name) => name.startsWith(COOKIE));

const seedSession = () => {
  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    user: { id: "patient-1", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} },
  };
  document.cookie = `${COOKIE}=base64-${btoa(JSON.stringify(session))}; path=/`;
};

const browserClient = async () => {
  vi.resetModules();
  const { createBrowserClient } = await import("@supabase/ssr");
  return createBrowserClient(`https://${PROJECT}.supabase.co`, "sb_publishable_test", { isSingleton: false });
};

describe("browser client sign-out, as Start a new intake relies on it", () => {
  beforeEach(() => {
    for (const name of sessionCookies()) document.cookie = `${name}=; max-age=0; path=/`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the seeded session before any sign-out", async () => {
    seedSession();
    const client = await browserClient();

    const { data } = await client.auth.getSession();

    expect(data.session?.user.id).toBe("patient-1");
  });

  it("leaves no session or session cookie after a completed logout", async () => {
    seedSession();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 }))
    );
    const client = await browserClient();

    const { error } = await client.auth.signOut({ scope: "local" });

    expect(error).toBeNull();
    expect((await client.auth.getSession()).data.session).toBeNull();
    expect(sessionCookies()).toEqual([]);
  });

  it("leaves no session or session cookie when the logout call cannot reach the auth service", async () => {
    seedSession();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    const client = await browserClient();

    const { error } = await client.auth.signOut({ scope: "local" });

    expect(error).not.toBeNull();
    expect((await client.auth.getSession()).data.session).toBeNull();
    expect(sessionCookies()).toEqual([]);
  });
});
