// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The ambassador dashboard's "QR SCANS & CLICKS" comes from here. On Beta it
// was always 0: the handler had nothing request-specific before its
// DUB_API_KEY check, so `next build` — which has no key, by design — froze that
// branch into a static all-zero response served to everyone, signed in or not.
// These tests pin the request-time behaviour; scripts/check-dynamic-api-routes
// pins the build output.

const state = vi.hoisted(() => ({
  order: [] as string[],
  user: { id: "ambassador-a" } as { id: string } | null,
  profiles: {} as Record<string, Record<string, unknown> | null>,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    connection: vi.fn(async () => {
      state.order.push("connection");
    }),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => {
        state.order.push("auth");
        return { data: { user: state.user }, error: state.user ? null : { message: "no session" } };
      },
    },
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, userId: string) => ({
          maybeSingle: async () => ({
            data: table === "ambassador_profiles" ? (state.profiles[userId] ?? null) : null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

const fetchMock = vi.fn();
const originalEnv = { ...process.env };

const dubCalls = () => fetchMock.mock.calls.filter((args) => String(args[0]).startsWith("https://api.dub.co/"));
const dubAnswers = (rows: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(rows), { status, headers: { "Content-Type": "application/json", ...headers } });
const rateLimited = (retryAfterSeconds?: number) =>
  dubAnswers(
    { error: { code: "rate_limit_exceeded", message: "Too many requests." } },
    429,
    retryAfterSeconds ? { "retry-after": String(retryAfterSeconds) } : {}
  );

const read = async (userId: string | null = "ambassador-a") => {
  state.user = userId ? { id: userId } : null;
  const { GET } = await import("../route");
  const response = await GET(new Request("https://beta.example/api/ambassadors/analytics"));
  return { response, status: response.status, body: (await response.json()) as Record<string, unknown> };
};

const at = (iso: string) => vi.setSystemTime(new Date(iso));

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  at("2026-09-25T12:00:00Z");
  state.order = [];
  state.profiles = {
    "ambassador-a": { provider_link_id: "link_A" },
    "ambassador-b": { provider_link_id: "link_B" },
  };
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.DUB_API_KEY = "dub_test_key";
  delete process.env.DUB_AMBASSADOR_LINK_DOMAIN;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/ambassadors/analytics — answered per request", () => {
  it("opts into request-time rendering before it does anything else", async () => {
    fetchMock.mockResolvedValue(dubAnswers([]));

    await read();

    expect(state.order[0]).toBe("connection");
    expect(state.order.indexOf("connection")).toBeLessThan(state.order.indexOf("auth"));
  });

  it("refuses a caller without a session, and never asks Dub", async () => {
    const { status, body } = await read(null);

    expect(status).toBe(401);
    expect(body).toEqual({ error: "unauthorized" });
    expect(dubCalls()).toHaveLength(0);
  });

  it("says the figures are unavailable when the key is missing, instead of reporting zero", async () => {
    delete process.env.DUB_API_KEY;

    const unauthenticated = await read(null);
    expect(unauthenticated.status).toBe(401);

    const { status, body } = await read();
    expect(status).toBe(503);
    expect(body).toEqual({ error: "analytics_not_configured" });
    expect(body).not.toHaveProperty("clicks");
  });

  it("is never cacheable by anything between Dub and the dashboard", async () => {
    fetchMock.mockResolvedValue(dubAnswers([]));

    const { response } = await read();

    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("GET /api/ambassadors/analytics — Dub's figures, as recorded", () => {
  it("asks Dub once, for this ambassador's stored link, with the server's key", async () => {
    fetchMock.mockResolvedValue(dubAnswers([]));

    await read();

    expect(dubCalls()).toHaveLength(1);
    const [url, init] = dubCalls()[0] as [string, RequestInit];
    const query = new URL(url).searchParams;
    expect(new URL(url).pathname).toBe("/analytics");
    expect(query.get("event")).toBe("composite");
    expect(query.get("groupBy")).toBe("triggers");
    expect(query.get("interval")).toBe("all");
    expect(query.get("linkId")).toBe("link_A");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer dub_test_key");
  });

  it("reports QR scans and link clicks by Dub's own trigger, not by subtraction", async () => {
    fetchMock.mockResolvedValue(
      dubAnswers([
        { trigger: "link", clicks: 3, leads: 1, sales: 0, saleAmount: 0 },
        { trigger: "qr", clicks: 2, leads: 1, sales: 0, saleAmount: 0 },
        { trigger: "pageview", clicks: 4, leads: 0, sales: 0, saleAmount: 0 },
      ])
    );

    const { body } = await read();

    expect(body).toEqual({
      clicks: 3,
      scans: 2,
      totalClicksAndScans: 5,
      totalClicks: 9,
      leads: 2,
      refreshInMs: 30_000,
    });
  });

  it("reports no scans when Dub recorded none, whatever the link clicks", async () => {
    fetchMock.mockResolvedValue(dubAnswers([{ trigger: "link", clicks: 7, leads: 0 }]));

    const { body } = await read();

    expect(body).toMatchObject({ clicks: 7, scans: 0, totalClicksAndScans: 7, totalClicks: 7 });
  });

  it("answers each ambassador for their own link", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      new URL(url).searchParams.get("linkId") === "link_A"
        ? dubAnswers([{ trigger: "link", clicks: 1 }])
        : dubAnswers([{ trigger: "qr", clicks: 5 }])
    );

    const a = await read("ambassador-a");
    const b = await read("ambassador-b");

    expect(a.body).toMatchObject({ clicks: 1, scans: 0 });
    expect(b.body).toMatchObject({ clicks: 0, scans: 5 });
    expect(dubCalls().map(([url]) => new URL(String(url)).searchParams.get("linkId"))).toEqual(["link_A", "link_B"]);
  });

  it("answers true zeros for an ambassador with no link yet", async () => {
    state.profiles["ambassador-a"] = null;
    fetchMock.mockResolvedValue(dubAnswers({ error: "no" }, 400));

    const { status, body } = await read();

    expect(status).toBe(200);
    expect(body).toEqual({
      clicks: 0,
      scans: 0,
      totalClicksAndScans: 0,
      totalClicks: 0,
      leads: 0,
      refreshInMs: 30_000,
    });
    expect(dubCalls()).toHaveLength(0);
  });

  it("does not read an unexpected answer from Dub as zero", async () => {
    fetchMock.mockResolvedValue(dubAnswers({ clicks: 12 }));

    const { status, body } = await read();

    expect(status).toBe(503);
    expect(body).toEqual({ error: "analytics_unavailable", refreshInMs: 30_000 });
  });
});

describe("GET /api/ambassadors/analytics — Dub traffic and failures", () => {
  it("does not ask Dub again for thirty seconds", async () => {
    fetchMock.mockResolvedValue(dubAnswers([{ trigger: "link", clicks: 1 }]));

    await read();
    at("2026-09-25T12:00:29Z");
    await read();
    expect(dubCalls()).toHaveLength(1);

    at("2026-09-25T12:00:31Z");
    await read();
    expect(dubCalls()).toHaveLength(2);
  });

  // An open dashboard asks again when this says; asking sooner gets the same figures,
  // so this is what keeps it within the cache window of Dub.
  it("tells the dashboard when asking again can return anything newer", async () => {
    fetchMock.mockResolvedValue(dubAnswers([{ trigger: "link", clicks: 1 }]));

    expect((await read()).body).toMatchObject({ clicks: 1, refreshInMs: 30_000 });

    at("2026-09-25T12:00:20Z");
    expect((await read()).body).toMatchObject({ clicks: 1, refreshInMs: 10_000 });
    expect(dubCalls()).toHaveLength(1);

    at("2026-09-25T12:00:31Z");
    expect((await read()).body).toMatchObject({ refreshInMs: 30_000 });
    expect(dubCalls()).toHaveLength(2);

    // during a provider cooldown: the rest of the cooldown, not the cache window
    at("2026-09-25T12:01:05Z");
    fetchMock.mockResolvedValueOnce(rateLimited(60));
    expect((await read()).body).toMatchObject({ stale: true, refreshInMs: 60_000 });
    at("2026-09-25T12:01:50Z");
    expect((await read()).body).toMatchObject({ stale: true, refreshInMs: 15_000 });
    expect(dubCalls()).toHaveLength(3);
  });

  it("shares one request between concurrent loads of the same dashboard", async () => {
    let release: (value: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (release = resolve)));

    const first = read();
    const second = read();
    await vi.waitFor(() => expect(dubCalls()).toHaveLength(1));
    release(dubAnswers([{ trigger: "qr", clicks: 2 }]));

    expect((await first).body).toMatchObject({ scans: 2 });
    expect((await second).body).toMatchObject({ scans: 2 });
    expect(dubCalls()).toHaveLength(1);
  });

  it("keeps the last good figures through a rate limit, never zeros", async () => {
    fetchMock.mockResolvedValueOnce(dubAnswers([{ trigger: "link", clicks: 4, leads: 1 }]));
    await read();

    at("2026-09-25T12:01:00Z");
    fetchMock.mockResolvedValueOnce(rateLimited(60));
    const { status, body } = await read();

    expect(status).toBe(200);
    expect(body).toEqual({
      clicks: 4,
      scans: 0,
      totalClicksAndScans: 4,
      totalClicks: 4,
      leads: 1,
      stale: true,
      refreshInMs: 60_000,
    });
  });

  it("waits out the rate limit for every ambassador instead of asking again", async () => {
    fetchMock.mockResolvedValueOnce(dubAnswers([{ trigger: "link", clicks: 4 }]));
    await read("ambassador-a");
    at("2026-09-25T12:01:00Z");
    fetchMock.mockResolvedValueOnce(rateLimited(60));
    await read("ambassador-a");
    expect(dubCalls()).toHaveLength(2);

    // inside the provider's Retry-After: nobody spends another request
    at("2026-09-25T12:01:30Z");
    const a = await read("ambassador-a");
    const b = await read("ambassador-b");

    expect(dubCalls()).toHaveLength(2);
    expect(a.body).toMatchObject({ clicks: 4, stale: true });
    expect(b.status).toBe(503);
    expect(b.body).toEqual({ error: "analytics_unavailable", refreshInMs: 30_000 });

    // after it, the next load asks again and recovers
    at("2026-09-25T12:02:01Z");
    fetchMock.mockResolvedValueOnce(dubAnswers([{ trigger: "link", clicks: 5 }]));
    const recovered = await read("ambassador-a");
    expect(recovered.body).toEqual({
      clicks: 5,
      scans: 0,
      totalClicksAndScans: 5,
      totalClicks: 5,
      leads: 0,
      refreshInMs: 30_000,
    });
  });

  it("cools down for a minute when Dub gives no Retry-After", async () => {
    fetchMock.mockResolvedValueOnce(rateLimited());
    await read();

    at("2026-09-25T12:00:59Z");
    await read();
    expect(dubCalls()).toHaveLength(1);

    at("2026-09-25T12:01:01Z");
    fetchMock.mockResolvedValueOnce(dubAnswers([]));
    await read();
    expect(dubCalls()).toHaveLength(2);
  });

  it("does not overwrite the last good figures when Dub cannot be reached", async () => {
    fetchMock.mockResolvedValueOnce(dubAnswers([{ trigger: "qr", clicks: 3 }]));
    await read();

    at("2026-09-25T12:01:00Z");
    fetchMock.mockRejectedValueOnce(new Error("fetch failed"));
    const failed = await read();
    expect(failed.body).toMatchObject({ scans: 3, stale: true });

    // and the failure did not become the new "last good"
    at("2026-09-25T12:01:10Z");
    fetchMock.mockResolvedValueOnce(dubAnswers({ error: { code: "internal_server_error" } }, 500));
    const again = await read();
    expect(again.body).toMatchObject({ scans: 3, stale: true });
  });

  it("reports the figures as unavailable when there is nothing good to fall back on", async () => {
    fetchMock.mockResolvedValueOnce(dubAnswers({ error: { code: "internal_server_error" } }, 500));

    const { status, body } = await read();

    expect(status).toBe(503);
    expect(body).toEqual({ error: "analytics_unavailable", refreshInMs: 30_000 });
  });

  it("does not serve one link's cached figures after the link has changed", async () => {
    fetchMock.mockResolvedValueOnce(dubAnswers([{ trigger: "link", clicks: 9 }]));
    await read();

    state.profiles["ambassador-a"] = { provider_link_id: "link_A2" };
    fetchMock.mockResolvedValueOnce(dubAnswers([{ trigger: "link", clicks: 1 }]));
    const { body } = await read();

    expect(body).toMatchObject({ clicks: 1 });
    expect(new URL(String(dubCalls()[1][0])).searchParams.get("linkId")).toBe("link_A2");
  });

  it("never logs the Dub key", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(rateLimited(5));

    await read();

    expect(JSON.stringify(logged.mock.calls)).not.toContain("dub_test_key");
  });
});
