import { isDebugEnabled } from "@/lib/debug";
import { createClient } from "@/lib/supabase/server";
import { connection, NextResponse } from "next/server";

const REFERRAL_API_BASE_URL = "https://api.dub.co";
const ANALYTICS_CACHE_TTL_MS = 30_000;
const RATE_LIMIT_DEFAULT_COOLDOWN_MS = 60_000;

/**
 * An ambassador's figures, exactly as Dub recorded them for their link.
 *
 *   clicks               visits recorded with trigger "link" — the short link followed
 *   scans                visits recorded with trigger "qr" — a QR code carrying `qr=1`
 *                        (see lib/dub-qr.ts)
 *   totalClicksAndScans  clicks + scans: the dashboard's "QR SCANS & CLICKS"
 *   totalClicks          every visit Dub recorded, whatever the trigger
 *   leads                leads recorded against the link
 *
 * Every answer also carries `refreshInMs`: how long until asking again can return
 * anything newer. The dashboard schedules its next request on it.
 *
 * People Helped is not here: it is the backend's list of the intakes behind
 * those leads (GET /ambassadors/people).
 */
type AnalyticsPayload = {
  clicks: number;
  scans: number;
  totalClicksAndScans: number;
  totalClicks: number;
  leads: number;
};

type KnownAnalytics = {
  payload: AnalyticsPayload;
  fetchedAt: number;
  identityKey: string;
};

// Kept per server process. The last good answer is what a failed or
// rate-limited refresh falls back to, so a provider hiccup is never shown to an
// ambassador as their numbers dropping to zero.
const lastKnownByUser = new Map<string, KnownAnalytics>();
const inflightByKey = new Map<string, Promise<AnalyticsPayload>>();
// Dub limits the workspace, not the ambassador: after one 429 every ambassador
// waits, rather than each of them spending another request to find out.
let providerCooldownUntil = 0;

// The rest of the cache window, or of a provider cooldown — asking sooner returns
// the same figures. An open dashboard that asks again after this long is never
// further behind Dub than the cache window.
function nextRefreshInMs(fetchedAt: number | undefined, now: number): number {
  const cooldownLeft = providerCooldownUntil - now;
  if (cooldownLeft > 0) return cooldownLeft;
  if (fetchedAt !== undefined) {
    const cacheLeft = ANALYTICS_CACHE_TTL_MS - (now - fetchedAt);
    if (cacheLeft > 0) return cacheLeft;
  }
  return ANALYTICS_CACHE_TTL_MS;
}

type TriggerRow = {
  trigger?: unknown;
  clicks?: unknown;
  leads?: unknown;
};

type LinkIdentity = { type: "linkId"; linkId: string } | { type: "domainKey"; domain: string; key: string } | null;

class DubAnalyticsError extends Error {
  status: number;
  retryAfterMs?: number;

  constructor(status: number, message: string, retryAfterMs?: number) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function normalizeUsername(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._]+/g, "");
}

function deriveFallbackUsername(email: string, userId: string): string {
  const localPart = normalizeUsername(email.split("@")[0] ?? "");
  const suffix = userId
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase()
    .slice(0, 6);
  const base = localPart || "ambassador";
  return `${base}_${suffix}`.slice(0, 30);
}

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toFiniteNonNegativeInteger(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.floor(numeric);
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.floor(seconds * 1000);
  }

  const asDate = Date.parse(value);
  if (!Number.isFinite(asDate)) return undefined;

  const ms = asDate - Date.now();
  return ms > 0 ? ms : undefined;
}

function resolveLinkIdentity(record: Record<string, unknown>): LinkIdentity {
  const providerLinkId = asNonEmptyString(record.provider_link_id);
  if (providerLinkId) {
    return { type: "linkId", linkId: providerLinkId };
  }

  const shortLink = asNonEmptyString(record.short_link);
  if (shortLink) {
    try {
      const url = new URL(shortLink.startsWith("http") ? shortLink : `https://${shortLink}`);
      const key = url.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
      if (key) {
        return { type: "domainKey", domain: url.hostname, key };
      }
    } catch {
      // Continue with key/domain fallback.
    }
  }

  const key =
    asNonEmptyString(record.referral_link_key) ||
    asNonEmptyString(record.username_display) ||
    asNonEmptyString(record.username);
  const domain = asNonEmptyString(process.env.DUB_AMBASSADOR_LINK_DOMAIN);

  if (key && domain) {
    return { type: "domainKey", domain, key };
  }

  return null;
}

/**
 * One request per refresh: the composite event grouped by trigger returns, for
 * each trigger that has any activity, its clicks and leads — so link clicks,
 * QR scans, the total and the leads all come from the same answer, with no
 * figure derived from another.
 */
async function fetchDubAnalytics(token: string, identity: Exclude<LinkIdentity, null>): Promise<AnalyticsPayload> {
  const query = new URLSearchParams({ event: "composite", groupBy: "triggers", interval: "all" });
  if (identity.type === "linkId") {
    query.set("linkId", identity.linkId);
  } else {
    query.set("domain", identity.domain);
    query.set("key", identity.key);
  }

  const response = await fetch(`${REFERRAL_API_BASE_URL}/analytics?${query.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    // The provider's error code is logged, not relayed: the caller is not its audience.
    const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
    const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
    console.error("[ambassadors.analytics] provider refused", {
      status: response.status,
      code: body?.error?.code ?? null,
    });
    throw new DubAnalyticsError(response.status, `dub_analytics_failed_${response.status}`, retryAfterMs);
  }

  const rows = (await response.json().catch(() => null)) as unknown;
  if (!Array.isArray(rows)) {
    throw new DubAnalyticsError(502, "dub_analytics_unexpected_response");
  }

  let clicks = 0;
  let scans = 0;
  let totalClicks = 0;
  let leads = 0;
  for (const row of rows as TriggerRow[]) {
    const rowClicks = toFiniteNonNegativeInteger(row?.clicks);
    totalClicks += rowClicks;
    leads += toFiniteNonNegativeInteger(row?.leads);
    if (row?.trigger === "link") clicks += rowClicks;
    if (row?.trigger === "qr") scans += rowClicks;
  }

  return { clicks, scans, totalClicksAndScans: clicks + scans, totalClicks, leads };
}

async function attemptRecoverLinkIdentity(request: Request, userId: string): Promise<{ ok: boolean; reason?: string }> {
  const supabase = await createClient();

  const { data: profileRecord } = await supabase
    .from("profiles")
    .select("email, preferred_name, first_name")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: ambassadorRecord } = await supabase
    .from("ambassador_profiles")
    .select("username, username_display, referral_link_key, display_name")
    .eq("user_id", userId)
    .maybeSingle();

  const email =
    (typeof profileRecord?.email === "string" ? profileRecord.email.trim().toLowerCase() : "") ||
    (typeof ambassadorRecord?.display_name === "string" ? "" : "");

  if (!email) {
    return { ok: false, reason: "missing_email_for_recovery" };
  }

  const username =
    normalizeUsername(
      (typeof ambassadorRecord?.username === "string" && ambassadorRecord.username) ||
        (typeof ambassadorRecord?.username_display === "string" && ambassadorRecord.username_display) ||
        (typeof ambassadorRecord?.referral_link_key === "string" && ambassadorRecord.referral_link_key) ||
        ""
    ) || deriveFallbackUsername(email, userId);

  if (!username) {
    return { ok: false, reason: "missing_username_for_recovery" };
  }

  const displayName =
    (typeof ambassadorRecord?.display_name === "string" && ambassadorRecord.display_name.trim()) ||
    (typeof profileRecord?.preferred_name === "string" && profileRecord.preferred_name.trim()) ||
    (typeof profileRecord?.first_name === "string" && profileRecord.first_name.trim()) ||
    "";

  const requestUrl = new URL(request.url);
  const localeFromPath = requestUrl.pathname.split("/").filter(Boolean)[0] || "en";

  const response = await fetch(`${requestUrl.origin}/api/ambassadors/link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({
      email,
      locale: localeFromPath,
      username,
      usernameDisplay: username,
      displayName,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, reason: payload?.error || `link_recovery_failed_${response.status}` };
  }

  return { ok: true };
}

function jsonNoStore(body: unknown, status: number) {
  // Every answer here is about one signed-in ambassador at one moment.
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  // Request-time, always. Nothing request-specific used to run before the
  // configuration check, so `next build` — which has no DUB_API_KEY, by design —
  // prerendered that branch into a static all-zero response and every
  // ambassador, signed in or not, was served it. See
  // scripts/check-dynamic-api-routes.mjs for the build-time guard.
  await connection();

  // Never from the address bar alone — see lib/debug.ts.
  const debugEnabled = isDebugEnabled(request);

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonNoStore({ error: "unauthorized" }, 401);
  }

  const token = process.env.DUB_API_KEY;
  if (!token) {
    // A deployment without the key cannot know the numbers; saying zero would
    // be a claim, so the dashboard is told the figures are unavailable.
    console.error("[ambassadors.analytics] DUB_API_KEY is not configured");
    return jsonNoStore(
      { error: "analytics_not_configured", ...(debugEnabled ? { debug: { reason: "missing_dub_api_key" } } : {}) },
      503
    );
  }

  const { data: ambassadorProfile, error: ambassadorProfileError } = await supabase
    .from("ambassador_profiles")
    .select("provider_link_id, referral_link_key, short_link, username_display, username")
    .eq("user_id", user.id)
    .maybeSingle();

  if (ambassadorProfileError) {
    return jsonNoStore({ error: "profile_storage_unavailable" }, 503);
  }

  let identity = resolveLinkIdentity((ambassadorProfile ?? {}) as Record<string, unknown>);
  let recoveryAttempt: { ok: boolean; reason?: string } | null = null;

  if (!identity) {
    recoveryAttempt = await attemptRecoverLinkIdentity(request, user.id).catch(() => ({
      ok: false,
      reason: "recovery_throw",
    }));

    if (recoveryAttempt.ok) {
      const { data: refreshedProfile } = await supabase
        .from("ambassador_profiles")
        .select("provider_link_id, referral_link_key, short_link, username_display, username")
        .eq("user_id", user.id)
        .maybeSingle();

      identity = resolveLinkIdentity((refreshedProfile ?? {}) as Record<string, unknown>);
    }
  }

  if (!identity) {
    // No link yet, so nothing can have been recorded: these zeros are true.
    const empty: AnalyticsPayload = { clicks: 0, scans: 0, totalClicksAndScans: 0, totalClicks: 0, leads: 0 };
    return jsonNoStore(
      {
        ...empty,
        refreshInMs: ANALYTICS_CACHE_TTL_MS,
        ...(debugEnabled
          ? {
              debug: {
                reason: "missing_link_identity",
                envDomainConfigured: asNonEmptyString(process.env.DUB_AMBASSADOR_LINK_DOMAIN) || null,
                recoveryAttempt,
              },
            }
          : {}),
      },
      200
    );
  }

  const identityKey = identity.type === "linkId" ? identity.linkId : `${identity.domain}/${identity.key}`;
  const known = lastKnownByUser.get(user.id);
  // A cached answer for a different link is not this link's answer.
  const lastGood = known && known.identityKey === identityKey ? known : undefined;
  const debugFor = (cache: string) => (debugEnabled ? { debug: { identity, cache } } : {});

  // Served from memory, or stale-but-true when the provider cannot be asked:
  // never zeros that the provider did not report.
  const fromLastGood = (cache: string) => {
    if (lastGood) {
      return jsonNoStore(
        {
          ...lastGood.payload,
          ...(cache === "fresh" ? {} : { stale: true }),
          refreshInMs: nextRefreshInMs(lastGood.fetchedAt, Date.now()),
          ...debugFor(cache),
        },
        200
      );
    }
    return jsonNoStore(
      { error: "analytics_unavailable", refreshInMs: nextRefreshInMs(undefined, Date.now()), ...debugFor(cache) },
      503
    );
  };

  const now = Date.now();
  if (lastGood && now - lastGood.fetchedAt < ANALYTICS_CACHE_TTL_MS) {
    return fromLastGood("fresh");
  }

  if (providerCooldownUntil > now) {
    return fromLastGood("cooldown");
  }

  try {
    const inflightKey = `${user.id}:${identityKey}`;
    let pending = inflightByKey.get(inflightKey);
    if (!pending) {
      pending = fetchDubAnalytics(token, identity).finally(() => {
        inflightByKey.delete(inflightKey);
      });
      inflightByKey.set(inflightKey, pending);
    }

    const payload = await pending;
    lastKnownByUser.set(user.id, { payload, fetchedAt: Date.now(), identityKey });
    return jsonNoStore({ ...payload, refreshInMs: ANALYTICS_CACHE_TTL_MS, ...debugFor("miss") }, 200);
  } catch (error) {
    if (error instanceof DubAnalyticsError && error.status === 429) {
      providerCooldownUntil = Date.now() + (error.retryAfterMs ?? RATE_LIMIT_DEFAULT_COOLDOWN_MS);
    }

    console.error("[ambassadors.analytics] failed to fetch Dub analytics", {
      message: error instanceof Error ? error.message : "unknown",
      userId: user.id,
    });
    return fromLastGood("provider_error");
  }
}
