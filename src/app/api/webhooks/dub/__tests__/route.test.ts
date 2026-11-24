// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Dub's webhook only ever means "this ambassador's numbers may have moved", and
// the refresh it triggers makes a dashboard go back to the provider. An event
// for a link that belongs to no current ambassador used to be broadcast to
// every open dashboard — each of which then spent a request of the workspace's
// rate limit on numbers that had not changed. The refresh now reaches only the
// ambassador who owns the link, and nobody otherwise.

const realtime = vi.hoisted(() => ({
  sent: [] as Array<{ event: string; payload: { ambassadorUserId?: string } }>,
  channels: 0,
  sendFails: false,
  owner: null as { user_id: string } | null,
  lookupError: null as { message: string; code: string } | null,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    channel: () => {
      realtime.channels += 1;
      const channel = {
        subscribe: (onStatus: (status: string) => void) => {
          onStatus("SUBSCRIBED");
          return channel;
        },
        send: async (message: { event: string; payload: { ambassadorUserId?: string } }) => {
          if (realtime.sendFails) throw new Error("realtime down");
          realtime.sent.push(message);
          return "ok";
        },
      };
      return channel;
    },
    removeChannel: async () => {},
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: realtime.owner, error: realtime.lookupError }) }),
      }),
    }),
  }),
}));

const SECRET = "whsec_test";
const originalEnv = { ...process.env };

const deliver = async (body: unknown, signature?: string) => {
  const { POST } = await import("../route");
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  headers["Dub-Signature"] = signature ?? createHmac("sha256", SECRET).update(raw).digest("hex");
  if (signature === "") delete headers["Dub-Signature"];
  const response = await POST(
    new Request("https://beta.example/api/webhooks/dub", { method: "POST", body: raw, headers })
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};

const click = (linkId?: string) => ({ event: "link.clicked", data: linkId ? { link: { id: linkId } } : {} });

beforeEach(() => {
  vi.resetModules();
  realtime.sent = [];
  realtime.channels = 0;
  realtime.sendFails = false;
  realtime.owner = null;
  realtime.lookupError = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  process.env.DUB_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("POST /api/webhooks/dub", () => {
  it("refreshes only the dashboard of the ambassador who owns the link", async () => {
    realtime.owner = { user_id: "ambassador-b" };

    const { status, body } = await deliver(click("link_b"));

    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, targeted: true });
    expect(realtime.sent).toHaveLength(1);
    expect(realtime.sent[0].payload.ambassadorUserId).toBe("ambassador-b");
  });

  it("broadcasts nothing for a link that belongs to no current ambassador", async () => {
    const { status, body } = await deliver(click("link_from_before_the_reset"));

    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, ignored: true, reason: "unmatched_link" });
    expect(realtime.sent).toEqual([]);
    expect(realtime.channels).toBe(0);
  });

  it("broadcasts nothing when the owner cannot be looked up", async () => {
    realtime.lookupError = { message: "connection reset", code: "XX000" };
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { body } = await deliver(click("link_b"));

    expect(body).toMatchObject({ ignored: true });
    expect(realtime.sent).toEqual([]);
  });

  it("broadcasts nothing for an event without a link", async () => {
    const { body } = await deliver(click());

    expect(body).toMatchObject({ ignored: true, reason: "no_link" });
    expect(realtime.channels).toBe(0);
  });

  it("ignores events that do not move an ambassador's numbers", async () => {
    realtime.owner = { user_id: "ambassador-b" };

    const { body } = await deliver({ event: "link.updated", data: { link: { id: "link_b" } } });

    expect(body).toMatchObject({ ignored: true });
    expect(realtime.channels).toBe(0);
  });

  it("asks Dub to retry when the refresh could not be delivered", async () => {
    realtime.owner = { user_id: "ambassador-b" };
    realtime.sendFails = true;
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { status } = await deliver(click("link_b"));

    expect(status).toBe(502);
  });

  it("still refuses unsigned and wrongly signed deliveries", async () => {
    expect((await deliver(click("link_b"), "")).status).toBe(401);
    expect((await deliver(click("link_b"), "00")).status).toBe(400);
    expect(realtime.channels).toBe(0);
  });
});
