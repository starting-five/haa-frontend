import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

const SUPABASE_URL_VAR = "NEXT_PUBLIC_SUPABASE_URL";
const SERVICE_ROLE_KEY_VAR = "SUPABASE_SERVICE_ROLE_KEY";
const DUB_WEBHOOK_SECRET_VAR = "DUB_WEBHOOK_SECRET";
const REFRESH_EVENTS = new Set(["link.clicked", "lead.created", "sale.created"]);

type DubWebhookPayload = {
  event?: string;
  data?: {
    link?: {
      id?: string;
    };
    linkId?: string;
    link_id?: string;
  };
  link?: {
    id?: string;
  };
  linkId?: string;
  link_id?: string;
};

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function readLinkId(payload: DubWebhookPayload | null): string {
  if (!payload || typeof payload !== "object") return "";

  const fromData = payload.data ?? {};
  return (
    asNonEmptyString(fromData.link?.id) ||
    asNonEmptyString(fromData.linkId) ||
    asNonEmptyString(fromData.link_id) ||
    asNonEmptyString(payload.link?.id) ||
    asNonEmptyString(payload.linkId) ||
    asNonEmptyString(payload.link_id)
  );
}

function verifySignature(rawBody: string, headerSignature: string, secret: string): boolean {
  const computed = createHmac("sha256", secret).update(rawBody).digest("hex");

  const expected = Buffer.from(computed, "utf8");
  const provided = Buffer.from(headerSignature.trim(), "utf8");
  if (expected.length !== provided.length) return false;

  return timingSafeEqual(expected, provided);
}

async function broadcastDashboardRefresh(url: string, serviceRoleKey: string, ambassadorUserId: string): Promise<void> {
  const supabase = createSupabaseClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const channel = supabase.channel("ambassador-metrics");

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const settle = (result: "resolve" | "reject", error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      void supabase.removeChannel(channel);
      if (result === "reject") {
        reject(error instanceof Error ? error : new Error("broadcast_failed"));
        return;
      }
      resolve();
    };

    const timeout = setTimeout(() => {
      settle("resolve");
    }, 3500);

    void channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;

      void (async () => {
        try {
          await channel.send({
            type: "broadcast",
            event: "refresh",
            payload: { source: "dub_webhook", ambassadorUserId },
          });
          settle("resolve");
        } catch (error) {
          settle("reject", error);
        }
      })();
    });
  });
}

async function resolveAmbassadorUserId(url: string, serviceRoleKey: string, linkId: string): Promise<string | null> {
  const supabase = createSupabaseClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase
    .from("ambassador_profiles")
    .select("user_id")
    .eq("provider_link_id", linkId)
    .maybeSingle();

  if (error) {
    console.error("[webhooks.dub] profile lookup:error", {
      message: error.message,
      code: error.code,
      linkId,
    });
    return null;
  }

  return typeof data?.user_id === "string" && data.user_id.trim().length > 0 ? data.user_id : null;
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const webhookSecret = process.env.DUB_WEBHOOK_SECRET;

  const missing = [
    ...(supabaseUrl ? [] : [SUPABASE_URL_VAR]),
    ...(serviceRoleKey ? [] : [SERVICE_ROLE_KEY_VAR]),
    ...(webhookSecret ? [] : [DUB_WEBHOOK_SECRET_VAR]),
  ];

  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
    console.error("[webhooks.dub] config:error", { missing });
    return NextResponse.json({ error: "configuration_error" }, { status: 503 });
  }

  const headerSignature = request.headers.get("Dub-Signature");
  if (!headerSignature) {
    return NextResponse.json({ error: "signature_missing" }, { status: 401 });
  }

  const rawBody = await request.text();
  if (!verifySignature(rawBody, headerSignature, webhookSecret)) {
    return NextResponse.json({ error: "signature_invalid" }, { status: 400 });
  }

  const payload = ((): DubWebhookPayload | null => {
    try {
      return (JSON.parse(rawBody) as DubWebhookPayload | null) ?? null;
    } catch {
      return null;
    }
  })();
  const event = payload?.event ?? "";

  if (!REFRESH_EVENTS.has(event)) {
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  // The refresh goes only to the ambassador who owns the link. An event this
  // app cannot place — a link belonging to no current ambassador, or a lookup
  // that failed — used to be broadcast untargeted, and every open dashboard
  // took that as its own and went back to the provider for its numbers: the
  // traffic that runs the workspace into its rate limit, for no one's benefit.
  // The dashboards recover anything missed when they next load or regain focus.
  const linkId = readLinkId(payload);
  if (!linkId) {
    return NextResponse.json({ ok: true, ignored: true, reason: "no_link" }, { status: 200 });
  }

  const ambassadorUserId = await resolveAmbassadorUserId(supabaseUrl, serviceRoleKey, linkId);
  if (!ambassadorUserId) {
    return NextResponse.json({ ok: true, ignored: true, reason: "unmatched_link" }, { status: 200 });
  }

  try {
    await broadcastDashboardRefresh(supabaseUrl, serviceRoleKey, ambassadorUserId);
    return NextResponse.json({ ok: true, targeted: true }, { status: 200 });
  } catch (error) {
    console.error("[webhooks.dub] realtime:error", {
      message: error instanceof Error ? error.message : "unknown",
      linkId,
    });
    // Non-2xx prompts Dub retries, which is safer for eventual delivery.
    return NextResponse.json({ error: "realtime_delivery_failed" }, { status: 502 });
  }
}
