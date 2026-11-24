// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Admin Dashboard (its own origin, on Vercel) calls the backend through this
// proxy — on Beta the backend itself is not reachable from a browser, so the proxy is
// where cross-origin access is decided. Only the exact origins in
// BACKEND_PROXY_CORS_ORIGINS are answered with CORS headers; everything else,
// including the same-origin patient app, behaves as it did before.

const ADMIN_ORIGIN = "https://haa-admin-puce.vercel.app";
const BETA_ORIGIN = "https://beta.helpafteraccident.com";
const UNRELATED_ORIGIN = "https://evil.example";

const fetchMock = vi.fn();
const originalEnv = { ...process.env };

const context = (...path: string[]) => ({ params: Promise.resolve({ path }) });
const request = (method: string, path: string, headers: Record<string, string> = {}, body?: string) =>
  new Request(`${BETA_ORIGIN}/api/backend/${path}`, { method, headers, body });

const load = async () => import("../[...path]/route");

beforeEach(() => {
  vi.resetModules();
  process.env.API_URL = "http://haa-backend:4000";
  process.env.BACKEND_PROXY_CORS_ORIGINS = ADMIN_ORIGIN;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => Response.json({ status: "ok" }, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
});

describe("backend proxy CORS — the Admin Dashboard origin", () => {
  it("answers its preflight with the proxy's methods and forwarded headers", async () => {
    const { OPTIONS } = await load();
    const response = OPTIONS(
      request("OPTIONS", "health", {
        Origin: ADMIN_ORIGIN,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,content-type",
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ADMIN_ORIGIN);
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toBe("accept, authorization, content-type");
    expect(response.headers.get("vary")).toContain("Origin");
    // bearer tokens, not cookies: credentials stay off
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("allows its GET and returns the backend's answer", async () => {
    const { GET } = await load();
    const response = await GET(request("GET", "health", { Origin: ADMIN_ORIGIN }), context("health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("access-control-allow-origin")).toBe(ADMIN_ORIGIN);
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("allows its POST with a bearer token, forwarding the token but not the Origin", async () => {
    const { POST } = await load();
    const response = await POST(
      request(
        "POST",
        "intake/start",
        { Origin: ADMIN_ORIGIN, Authorization: "Bearer admin-token", "Content-Type": "application/json" },
        "{}"
      ),
      context("intake", "start")
    );

    expect(response.headers.get("access-control-allow-origin")).toBe(ADMIN_ORIGIN);
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const forwarded = new Headers(init.headers);
    expect(forwarded.get("authorization")).toBe("Bearer admin-token");
    expect(forwarded.get("origin")).toBeNull();
  });

  it("does not widen the path allowlist beyond portal/review-decision", async () => {
    const { GET, POST } = await load();
    const refused = [
      // every patient's record — deliberately never proxied
      await GET(request("GET", "portal/submissions", { Origin: ADMIN_ORIGIN }), context("portal", "submissions")),
      // the new path is POST only
      await GET(
        request("GET", "portal/review-decision", { Origin: ADMIN_ORIGIN }),
        context("portal", "review-decision")
      ),
      // the lawyer link's decision endpoint stays behind the frontend's own review routes
      await POST(
        request("POST", "portal/review-decision-link", { Origin: ADMIN_ORIGIN }, "{}"),
        context("portal", "review-decision-link")
      ),
      // so do the link's case and its verification: the review page reads the
      // case server-side with the link's token, never through this proxy
      await POST(
        request("POST", "portal/review-case", { Origin: ADMIN_ORIGIN }, "{}"),
        context("portal", "review-case")
      ),
      await POST(
        request("POST", "portal/review-access/verify", { Origin: ADMIN_ORIGIN }, "{}"),
        context("portal", "review-access", "verify")
      ),
    ];

    for (const response of refused) {
      expect(response.status).toBe(404);
      // the refusal is readable by the dashboard rather than masked as a CORS error
      expect(response.headers.get("access-control-allow-origin")).toBe(ADMIN_ORIGIN);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// Thomas: the dashboard's review decisions go through this proxy as
// POST /api/backend/portal/review-decision.
describe("backend proxy — POST portal/review-decision for the Admin Dashboard", () => {
  const decisionBody = JSON.stringify({
    claimantUserId: "11111111-1111-4111-8111-111111111111",
    submissionId: "22222222-2222-4222-8222-222222222222",
    action: "pass_to_lawyer",
  });

  it("answers the Admin Dashboard's preflight for it", async () => {
    const { OPTIONS } = await load();
    const response = OPTIONS(
      request("OPTIONS", "portal/review-decision", {
        Origin: ADMIN_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ADMIN_ORIGIN);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
    expect(response.headers.get("access-control-allow-headers")).toContain("content-type");
  });

  it("forwards the Admin Dashboard's POST to the backend and lets it read the answer", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({ ok: true, action: "pass_to_lawyer", status: "attorney" }, { status: 200 })
    );
    const { POST } = await load();
    const response = await POST(
      request(
        "POST",
        "portal/review-decision",
        { Origin: ADMIN_ORIGIN, Authorization: "Bearer admin-token", "Content-Type": "application/json" },
        decisionBody
      ),
      context("portal", "review-decision")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, action: "pass_to_lawyer", status: "attorney" });
    expect(response.headers.get("access-control-allow-origin")).toBe(ADMIN_ORIGIN);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("http://haa-backend:4000/portal/review-decision");
    expect(init.method).toBe("POST");
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe(decisionBody);
    const forwarded = new Headers(init.headers);
    expect(forwarded.get("authorization")).toBe("Bearer admin-token");
    expect(forwarded.get("content-type")).toBe("application/json");
    expect(forwarded.get("origin")).toBeNull();
  });

  it("passes the backend's refusal through unchanged, readable by the dashboard", async () => {
    fetchMock.mockImplementation(async () => Response.json({ error: "Unauthorized" }, { status: 401 }));
    const { POST } = await load();
    const response = await POST(
      request(
        "POST",
        "portal/review-decision",
        { Origin: ADMIN_ORIGIN, "Content-Type": "application/json" },
        decisionBody
      ),
      context("portal", "review-decision")
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(response.headers.get("access-control-allow-origin")).toBe(ADMIN_ORIGIN);
  });

  it("gives an unrelated origin no CORS headers for it, so that origin's browser never sends the POST", async () => {
    const { OPTIONS, POST } = await load();
    const preflight = OPTIONS(
      request("OPTIONS", "portal/review-decision", {
        Origin: UNRELATED_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      })
    );
    const response = await POST(
      request(
        "POST",
        "portal/review-decision",
        { Origin: UNRELATED_ORIGIN, "Content-Type": "application/json" },
        decisionBody
      ),
      context("portal", "review-decision")
    );

    for (const r of [preflight, response]) {
      expect(r.headers.get("access-control-allow-origin")).toBeNull();
      expect(r.headers.get("access-control-allow-methods")).toBeNull();
    }
  });

  it("is accepted from the Beta frontend's own origin too — a same-origin POST reaches the backend", async () => {
    const { POST } = await load();
    const response = await POST(
      request(
        "POST",
        "portal/review-decision",
        { Origin: BETA_ORIGIN, "Content-Type": "application/json" },
        decisionBody
      ),
      context("portal", "review-decision")
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("backend proxy CORS — everyone else", () => {
  it("gives an unrelated origin no CORS headers, on the preflight or the request", async () => {
    const { OPTIONS, GET } = await load();
    const preflight = OPTIONS(request("OPTIONS", "health", { Origin: UNRELATED_ORIGIN }));
    const response = await GET(request("GET", "health", { Origin: UNRELATED_ORIGIN }), context("health"));

    for (const r of [preflight, response]) {
      expect(r.headers.get("access-control-allow-origin")).toBeNull();
      expect(r.headers.get("access-control-allow-methods")).toBeNull();
      expect(r.headers.get("access-control-allow-headers")).toBeNull();
    }
    expect(preflight.headers.get("allow")).toBe("GET, HEAD, OPTIONS, POST");
  });

  it("does not match look-alikes of the admin origin", async () => {
    const { GET } = await load();
    for (const origin of [
      "http://haa-admin-puce.vercel.app",
      "https://evil.haa-admin-puce.vercel.app",
      "https://haa-admin-puce.vercel.app.evil.example",
      "https://haa-admin-puce.vercel.app:8443",
      "null",
    ]) {
      const response = await GET(request("GET", "health", { Origin: origin }), context("health"));
      expect(response.headers.get("access-control-allow-origin"), origin).toBeNull();
    }
  });

  it("treats a * entry as nothing, not as a wildcard", async () => {
    process.env.BACKEND_PROXY_CORS_ORIGINS = "*";
    const { GET, OPTIONS } = await load();

    expect(
      (await GET(request("GET", "health", { Origin: UNRELATED_ORIGIN }), context("health"))).headers.get(
        "access-control-allow-origin"
      )
    ).toBeNull();
    expect(
      OPTIONS(request("OPTIONS", "health", { Origin: "*" })).headers.get("access-control-allow-origin")
    ).toBeNull();
  });

  it("keeps the Beta frontend's own same-origin calls working exactly as before", async () => {
    const { GET, POST } = await load();
    const get = await GET(
      request("GET", "patient/dashboard", { Origin: BETA_ORIGIN, Authorization: "Bearer patient" }),
      context("patient", "dashboard")
    );
    const post = await POST(request("POST", "intake/start", { Origin: BETA_ORIGIN }, "{}"), context("intake", "start"));
    const noOrigin = await GET(request("GET", "version"), context("version"));

    for (const r of [get, post, noOrigin]) {
      expect(r.status).toBe(200);
      expect(r.headers.get("access-control-allow-origin")).toBeNull();
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("answers with no CORS headers at all when no origin is configured (every other environment)", async () => {
    delete process.env.BACKEND_PROXY_CORS_ORIGINS;
    const { GET, OPTIONS } = await load();
    const response = await GET(request("GET", "health", { Origin: ADMIN_ORIGIN }), context("health"));
    const preflight = OPTIONS(request("OPTIONS", "health", { Origin: ADMIN_ORIGIN }));

    for (const r of [response, preflight]) {
      expect(r.headers.get("access-control-allow-origin")).toBeNull();
      expect(r.headers.get("vary")).toBeNull();
    }
  });
});

// Case Summary's Save is POST /api/backend/case/<id>. The backend decides
// ownership from the session; the proxy only has to pass exactly that path.
describe("backend proxy — POST case/:submissionId for Case Summary", () => {
  it("forwards a save to the backend with its body and bearer token", async () => {
    const { POST } = await load();
    const body = JSON.stringify({ injuries: "back" });
    const response = await POST(
      request(
        "POST",
        "case/submission-123",
        { Authorization: "Bearer patient-token", "Content-Type": "application/json" },
        body
      ),
      context("case", "submission-123")
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("http://haa-backend:4000/case/submission-123");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer patient-token");
  });

  it("refuses anything below it", async () => {
    const { POST } = await load();
    const response = await POST(
      request("POST", "case/submission-123/extra", {}, "{}"),
      context("case", "submission-123", "extra")
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
