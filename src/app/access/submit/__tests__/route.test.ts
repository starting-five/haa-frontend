import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "../route";

/**
 * The gate's redirect target is the thing under test here.
 *
 * On the first TEST deployment the handler built its redirect from
 * `new URL(request.url).origin`, which behind Caddy resolves to the server's own
 * binding — `https://0.0.0.0:3000`. The password was accepted and the cookie was
 * set, but the browser was sent to an address that does not resolve, so the gate
 * looked broken to every stakeholder who used it. These tests pin the origin to
 * what the client actually asked for.
 */

const PASSWORD = "test-gate-password";

function submit(
  body: Record<string, string>,
  headers: Record<string, string> = {},
  url = "http://0.0.0.0:3000/access/submit"
) {
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) form.append(key, value);
  return POST(new Request(url, { method: "POST", body: form, headers }));
}

/** Headers Caddy adds when proxying haaaaaaaa.com to the container. */
const PROXIED = {
  host: "haaaaaaaa.com",
  "x-forwarded-host": "haaaaaaaa.com",
  "x-forwarded-proto": "https",
};

describe("staging gate submit", () => {
  beforeEach(() => {
    process.env.STAGING_GATE_PASSWORD = PASSWORD;
  });

  afterEach(() => {
    delete process.env.STAGING_GATE_PASSWORD;
  });

  it("redirects to the public HTTPS origin, never the internal binding", async () => {
    const response = await submit({ password: PASSWORD, next: "/" }, PROXIED);
    const location = response.headers.get("location") ?? "";

    expect(location).toBe("https://haaaaaaaa.com/");
    expect(location).not.toContain("0.0.0.0");
    expect(location).not.toContain(":3000");
  });

  it("grants access for the correct password", async () => {
    const response = await submit({ password: PASSWORD, next: "/" }, PROXIED);
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(cookie).toContain("staging_access=granted");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
  });

  it("rejects an incorrect password without granting a cookie", async () => {
    const response = await submit({ password: "wrong", next: "/" }, PROXIED);

    expect(response.headers.get("location")).toBe("https://haaaaaaaa.com/access?error=1");
    expect(response.headers.get("set-cookie") ?? "").not.toContain("granted");
  });

  it("returns the visitor to the deep route they originally asked for", async () => {
    const response = await submit({ password: PASSWORD, next: "/en/intake/phone" }, PROXIED);

    expect(response.headers.get("location")).toBe("https://haaaaaaaa.com/en/intake/phone");
  });

  it("keeps the next path when the password is wrong so a retry lands correctly", async () => {
    const response = await submit({ password: "wrong", next: "/en/intake/phone" }, PROXIED);
    const location = response.headers.get("location") ?? "";

    expect(location).toContain("/access?");
    expect(location).toContain("error=1");
    expect(location).toContain("next=%2Fen%2Fintake%2Fphone");
  });

  it("refuses an external next target rather than redirecting off-site", async () => {
    const response = await submit({ password: PASSWORD, next: "//evil.example.com/x" }, PROXIED);

    expect(response.headers.get("location")).toBe("https://haaaaaaaa.com/");
  });

  it("prefers x-forwarded-host over the Host header when both are present", async () => {
    const response = await submit(
      { password: PASSWORD, next: "/" },
      { host: "127.0.0.1:3000", "x-forwarded-host": "haaaaaaaa.com", "x-forwarded-proto": "https" }
    );

    expect(response.headers.get("location")).toBe("https://haaaaaaaa.com/");
  });

  it("falls back to the Host header when no proxy headers are present", async () => {
    const response = await submit({ password: PASSWORD, next: "/" }, { host: "localhost:3000" });

    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("does not mark the cookie Secure when the visitor used plain http", async () => {
    const response = await submit({ password: PASSWORD, next: "/" }, { host: "localhost:3000" });

    expect(response.headers.get("set-cookie") ?? "").not.toContain("Secure");
  });
});
