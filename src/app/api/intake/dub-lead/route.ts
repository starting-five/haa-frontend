import { getApiBaseUrl } from "@/lib/backend-api";
import { emitPosthogIntegrationLog, flushPosthogIntegrationLogs } from "@/lib/posthog-logs";
import { createClient } from "@/lib/supabase/server";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { after, NextResponse } from "next/server";
import { z } from "zod";

const REFERRAL_API_BASE_URL = "https://api.dub.co";
const DUB_CLICK_ID_COOKIE = "dub_click_id";
const DUB_VIA_COOKIE = "dub_via";

const payloadSchema = z.object({
  submissionId: z.string().min(1),
  locale: z.string().min(1),
  claimant: z
    .object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().email().optional(),
    })
    .optional(),
});

function asNonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function clearAttributionCookies(response: NextResponse, isSecure: boolean): NextResponse {
  response.cookies.set(DUB_CLICK_ID_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(DUB_VIA_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    maxAge: 0,
  });
  return response;
}

function schedulePosthogLogFlush() {
  try {
    after(flushPosthogIntegrationLogs);
  } catch {
    // Vitest invokes route handlers outside Next's request scope.
    void flushPosthogIntegrationLogs();
  }
}

export async function POST(request: Request) {
  const isSecure = new URL(request.url).protocol === "https:";
  const token = process.env.DUB_API_KEY;
  if (!token) {
    return NextResponse.json({ ok: true, tracked: false, reason: "dub_not_configured" }, { status: 200 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!user || !session?.access_token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  emitPosthogIntegrationLog("intake_lead_tracking_requested", SeverityNumber.INFO, {
    route: "/api/intake/dub-lead",
  });
  schedulePosthogLogFlush();

  // The submission id decides which ambassador a patient is attributed to, and
  // that attribution is what the People Helped list is scoped by. An id taken
  // on trust would let any authenticated caller pull a stranger's record into
  // their own list, so it is checked against the backend's own ownership
  // resolver before it is sent anywhere. GET /case/:submissionId answers 404
  // for a case belonging to someone else, so anything but 200 means "not
  // yours" and nothing is tracked.
  const ownership = await fetch(`${getApiBaseUrl()}/case/${encodeURIComponent(parsed.data.submissionId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  }).catch(() => null);

  if (!ownership?.ok) {
    console.error("[intake.dub-lead] ownership_check_failed", {
      submissionId: parsed.data.submissionId,
      userId: user.id,
      status: ownership?.status ?? "unreachable",
    });
    return NextResponse.json({ ok: true, tracked: false, reason: "submission_not_owned" }, { status: 200 });
  }

  const dubClickId = request.headers.get("cookie")
    ? request.headers
        .get("cookie")
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${DUB_CLICK_ID_COOKIE}=`))
        ?.slice(DUB_CLICK_ID_COOKIE.length + 1)
    : undefined;

  const dubVia = request.headers.get("cookie")
    ? request.headers
        .get("cookie")
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${DUB_VIA_COOKIE}=`))
        ?.slice(DUB_VIA_COOKIE.length + 1)
    : undefined;

  if (!dubClickId) {
    // Silent before this: the click-to-lead call to Dub was skipped, and
    // nothing in the terminal said so — unlike the webhook receiver, which
    // always logs. A lead never reaching Dub looks identical to Dub never
    // calling back, so the two have to be told apart here.
    console.warn("[intake.dub-lead] skipped_lead_track", {
      reason: "missing_dub_click_id",
      submissionId: parsed.data.submissionId,
      userId: user.id,
    });
    return NextResponse.json({ ok: true, tracked: false, reason: "missing_dub_click_id" }, { status: 200 });
  }

  const firstName = asNonEmpty(parsed.data.claimant?.firstName);
  const lastName = asNonEmpty(parsed.data.claimant?.lastName);
  const email = asNonEmpty(parsed.data.claimant?.email);
  const customerName = [firstName, lastName].filter(Boolean).join(" ") || undefined;

  try {
    const response = await fetch(`${REFERRAL_API_BASE_URL}/track/lead`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "async",
        clickId: dubClickId,
        eventName: "Intake Started",
        customerExternalId: parsed.data.submissionId,
        customerName,
        customerEmail: email,
        metadata: {
          source: "intake_otp",
          locale: parsed.data.locale,
          via: dubVia,
          userId: user.id,
        },
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      emitPosthogIntegrationLog("intake_lead_tracking_failed", SeverityNumber.WARN, {
        route: "/api/intake/dub-lead",
        provider_status: response.status,
      });

      // Only the provider's error code is logged: its message repeats the
      // click id, and the attribution cookie's value stays out of the logs.
      const errorBody = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
      console.error("[intake.dub-lead] track_failed", {
        status: response.status,
        code: errorBody?.error?.code ?? null,
        submissionId: parsed.data.submissionId,
        userId: user.id,
      });

      // 404 is the provider saying it never recorded this click — a bot visit,
      // or an id from another workspace or a long-gone link. That answer will
      // not change, and keeping the cookie made every later intake in this
      // browser fail the same way for a week. It is cleared, so the next real
      // click can take its place. Anything else (a rate limit, an outage) may
      // succeed on the next intake, so the attribution is kept.
      if (response.status === 404) {
        return clearAttributionCookies(
          NextResponse.json({ ok: true, tracked: false, reason: "dub_click_not_found" }, { status: 200 }),
          isSecure
        );
      }
      return NextResponse.json({ ok: true, tracked: false, reason: "dub_track_failed" }, { status: 200 });
    }

    console.log("[intake.dub-lead] tracked", {
      submissionId: parsed.data.submissionId,
      userId: user.id,
    });
    emitPosthogIntegrationLog("intake_lead_tracking_completed", SeverityNumber.INFO, {
      route: "/api/intake/dub-lead",
    });
    return clearAttributionCookies(NextResponse.json({ ok: true, tracked: true }, { status: 200 }), isSecure);
  } catch (error) {
    emitPosthogIntegrationLog("intake_lead_tracking_request_failed", SeverityNumber.ERROR, {
      route: "/api/intake/dub-lead",
    });
    console.error("[intake.dub-lead] request_failed", {
      submissionId: parsed.data.submissionId,
      userId: user.id,
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ ok: true, tracked: false, reason: "dub_track_request_failed" }, { status: 200 });
  }
}
