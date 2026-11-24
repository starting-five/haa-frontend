// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Provisioning an ambassador's referral link.
//
// Enrolling a partner makes Dub create the partner group's default link, keyed on
// the username and pointed at the group's URL. The route's upsert then conflicts on
// that key and adopts the existing link. On Muhammad Test, which shares Beta's
// partner program, every new ambassador came out of onboarding with a link that
// sent clicks and QR scans to Beta — provisioning said "success" and the
// DUB_AMBASSADOR_DESTINATION_URL it was configured with was never applied.
//
// The Dub exchanges below are the ones recorded for that ambassador: partner and
// link created 63 ms apart, the upsert answered 409, /links/info returned the
// default link with the group's URL.

const DESTINATION = "http://13.222.146.180";
const GROUP_DEFAULT_URL = "https://beta.helpafteraccident.com";
const LINK_DOMAIN = "go.beta.helpafteraccident.com";

const state = vi.hoisted(() => ({
  ambassadorUpserts: [] as Record<string, unknown>[],
  events: [] as string[],
  existingProfile: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "ded43de4-0000-4000-8000-000000000001", phone: "18888888888" } },
        error: null,
      }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "ambassador_profiles" ? state.existingProfile : null,
            error: null,
          }),
        }),
      }),
      upsert: async (payload: Record<string, unknown>) => {
        if (table === "ambassador_profiles") {
          state.ambassadorUpserts.push(payload);
          state.events.push(`db:${String(payload.provisioning_status)}`);
        }
        return { error: null };
      },
      insert: async () => ({ error: null }),
    }),
  }),
}));

type DubRoute = { status: number; body: unknown };
const dub = {
  partner: { status: 200, body: { id: "pn_new" } } as DubRoute,
  upsert: { status: 200, body: {} } as DubRoute,
  info: { status: 200, body: {} } as DubRoute,
  patch: { status: 200, body: {} } as DubRoute,
};

const defaultLink = (url: string) => ({
  id: "link_default",
  key: "jessparity0916",
  domain: LINK_DOMAIN,
  url,
  shortLink: `https://${LINK_DOMAIN}/jessparity0916`,
  partnerId: "pn_new",
});

const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  state.events.push(`dub:${method} ${url.pathname}`);
  const answer = (route: DubRoute) =>
    new Response(JSON.stringify(route.body), { status: route.status, headers: { "Content-Type": "application/json" } });
  if (method === "POST" && url.pathname === "/partners") return answer(dub.partner);
  if (method === "PUT" && url.pathname === "/partners/links/upsert") return answer(dub.upsert);
  if (method === "GET" && url.pathname === "/links/info") return answer(dub.info);
  if (method === "PATCH" && url.pathname.startsWith("/links/")) return answer(dub.patch);
  throw new Error(`unexpected Dub call ${method} ${url.pathname}`);
});

const dubCalls = (method: string) =>
  fetchMock.mock.calls
    .filter(([, init]) => (init?.method ?? "GET") === method)
    .map(([input, init]) => ({
      path: new URL(String(input)).pathname,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    }));

const provision = async () => {
  const { POST } = await import("../route");
  const response = await POST(
    new Request("http://13.222.146.180/api/ambassadors/link", {
      method: "POST",
      body: JSON.stringify({
        username: "jessparity0916",
        email: "qa+jessparity0916@example.com",
        firstName: "QA",
        lastName: "Smoke",
        locale: "en",
      }),
    })
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};

const lastAmbassadorUpsert = () => state.ambassadorUpserts[state.ambassadorUpserts.length - 1];

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  state.ambassadorUpserts = [];
  state.events = [];
  state.existingProfile = null;
  process.env.DUB_API_KEY = "dub_test_key";
  process.env.DUB_AMBASSADOR_DESTINATION_URL = DESTINATION;
  process.env.DUB_AMBASSADOR_LINK_DOMAIN = LINK_DOMAIN;
  dub.partner = { status: 200, body: { id: "pn_new" } };
  dub.upsert = {
    status: 409,
    body: { error: { code: "conflict", message: "Duplicate key: This short link key is already in use." } },
  };
  dub.info = { status: 200, body: defaultLink(GROUP_DEFAULT_URL) };
  dub.patch = { status: 200, body: defaultLink(`${DESTINATION}/`) };
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

describe("POST /api/ambassadors/link — destination of the provisioned link", () => {
  it("points Dub's default link at this environment before reporting success", async () => {
    const { status, body } = await provision();

    expect(status).toBe(200);
    expect(body.shortLink).toBe(`https://${LINK_DOMAIN}/jessparity0916`);
    expect(dubCalls("PATCH")).toEqual([{ path: "/links/link_default", body: { url: DESTINATION } }]);
    expect(lastAmbassadorUpsert()).toMatchObject({
      provisioning_status: "success",
      provider_link_id: "link_default",
      short_link: `https://${LINK_DOMAIN}/jessparity0916`,
    });
  });

  it("repoints before the success row is written, so a stored link is never a misrouted one", async () => {
    await provision();

    const patched = state.events.indexOf("dub:PATCH /links/link_default");
    const stored = state.events.indexOf("db:success");
    expect(patched).toBeGreaterThan(-1);
    expect(stored).toBeGreaterThan(patched);
    expect(state.ambassadorUpserts.filter((row) => row.short_link)).toHaveLength(1);
  });

  it("leaves a link alone when it already reaches the destination — Beta's case", async () => {
    dub.info = { status: 200, body: defaultLink(`${DESTINATION}/?utm_source=dub&utm_medium=partner`) };

    const { status } = await provision();

    expect(status).toBe(200);
    expect(dubCalls("PATCH")).toEqual([]);
  });

  it("leaves a freshly created link alone", async () => {
    dub.upsert = { status: 200, body: { ...defaultLink(DESTINATION), id: "link_fresh" } };

    const { status, body } = await provision();

    expect(status).toBe(200);
    expect(body.linkId).toBe("link_fresh");
    expect(dubCalls("GET")).toEqual([]);
    expect(dubCalls("PATCH")).toEqual([]);
  });

  it("repoints a different path on the same host", async () => {
    process.env.DUB_AMBASSADOR_DESTINATION_URL = `${GROUP_DEFAULT_URL}/en/intake`;
    dub.patch = { status: 200, body: defaultLink(`${GROUP_DEFAULT_URL}/en/intake`) };

    const { status } = await provision();

    expect(status).toBe(200);
    expect(dubCalls("PATCH")).toEqual([
      { path: "/links/link_default", body: { url: `${GROUP_DEFAULT_URL}/en/intake` } },
    ]);
  });

  it("fails provisioning, and says why in the log, when Dub refuses the repoint", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    dub.patch = { status: 403, body: { error: { code: "forbidden", message: "Not allowed." } } };

    const { status, body } = await provision();

    expect(status).toBe(502);
    expect(body).toEqual({ error: "referral_link_unavailable" });
    expect(state.ambassadorUpserts.some((row) => row.provisioning_status === "success")).toBe(false);
    expect(lastAmbassadorUpsert()).toMatchObject({ provisioning_status: "failed" });
    expect(logged).toHaveBeenCalledWith("[ambassadors.link] referral link repoint failed", {
      linkId: "link_default",
      status: 403,
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("dub_test_key");
  });

  it("fails provisioning when Dub accepts the repoint but the link still goes elsewhere", async () => {
    dub.patch = { status: 200, body: defaultLink(GROUP_DEFAULT_URL) };

    const { status } = await provision();

    expect(status).toBe(502);
    expect(state.ambassadorUpserts.some((row) => row.provisioning_status === "success")).toBe(false);
  });
});
