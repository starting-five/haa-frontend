import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The route reads NEXT_PUBLIC_* values that are inlined at build time and
// HAA_* values supplied by the deployment, so the test sets both and asserts
// what a caller actually receives over HTTP.

// connection() only resolves inside a request scope, which vitest does not
// provide; the route's contract here is that it calls it on every request, so
// the call is what gets asserted.
const connection = vi.fn(async () => {});
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: () => connection(),
}));

const BUILD_ENV = {
  NEXT_PUBLIC_APP_VERSION: "0.1.0-rc8",
  NEXT_PUBLIC_FRONTEND_SHA: "e5fa6b79c84f9c6482d5dfe185b4f405762c77c9",
  NEXT_PUBLIC_BUILD_ID: "gha-17482912-1",
  NEXT_PUBLIC_BUILT_AT: "2026-09-22T09:15:00Z",
} as const;

const originalEnv = { ...process.env };

const loadRoute = () => import("../route");

describe("GET /api/version", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(BUILD_ENV)) process.env[key] = value;
    delete process.env.HAA_ENVIRONMENT;
    delete process.env.HAA_IMAGE_DIGEST;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("answers with the build identity and the deployment environment", async () => {
    process.env.HAA_ENVIRONMENT = "beta";
    process.env.HAA_IMAGE_DIGEST = `sha256:${"c".repeat(64)}`;

    const { GET } = await loadRoute();
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      application: "haa-frontend",
      version: "0.1.0-rc8",
      gitSha: "e5fa6b79c84f9c6482d5dfe185b4f405762c77c9",
      environment: "beta",
      buildId: "gha-17482912-1",
      builtAt: "2026-09-22T09:15:00.000Z",
      imageDigest: `sha256:${"c".repeat(64)}`,
    });
  });

  it("reports the environment it is configured with, the build being identical", async () => {
    process.env.HAA_ENVIRONMENT = "alpha";
    const { GET } = await loadRoute();
    const alpha = await (await GET()).json();

    process.env.HAA_ENVIRONMENT = "production";
    const production = await (await GET()).json();

    expect(alpha.environment).toBe("alpha");
    expect(production.environment).toBe("production");
    expect(alpha.version).toBe(production.version);
    expect(alpha.gitSha).toBe(production.gitSha);
  });

  it("says unknown rather than guessing when the deployment sets no environment", async () => {
    const { GET } = await loadRoute();
    await expect((await GET()).json()).resolves.toMatchObject({ environment: "unknown" });
  });

  // With cacheComponents enabled a handler that reads no request data is
  // prerendered at build time, which would freeze the environment of whichever
  // build produced the image. connection() is what keeps it a runtime answer.
  it("is resolved per request, so a cached answer cannot outlive the deployment", async () => {
    const { GET } = await loadRoute();

    connection.mockClear();
    await GET();

    expect(connection).toHaveBeenCalledTimes(1);
  });

  it("exposes no secret that shares the container's environment", async () => {
    process.env.HAA_ENVIRONMENT = "production";
    // Assembled rather than written out: a literal that looks like a key trips
    // secret scanners that cannot tell a fixture from the real thing.
    process.env.SUPABASE_SERVICE_ROLE_KEY = ["sb", "secret", "must", "not", "leak"].join("_");
    process.env.STAGING_GATE_PASSWORD = "gate-must-not-leak";
    process.env.DUB_API_KEY = ["dub", "must", "not", "leak"].join("_");

    const { GET } = await loadRoute();
    const body = JSON.stringify(await (await GET()).json());

    expect(body).not.toMatch(/sb_secret|must_not_leak|must-not-leak|dub_/i);
  });
});
