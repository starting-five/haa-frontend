import { getApiBaseUrl } from "@/lib/backend-api";
import { parseReviewAccess, REVIEW_ACCESS_COOKIE } from "@/lib/review-access";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// The lawyer's accept or reject. Only the action comes from the browser; the
// case and the link's token come from the HttpOnly review cookie, and the
// backend finds the assignment from the token, so nothing in the request body
// can point the decision at another case.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const access = parseReviewAccess(cookieStore.get(REVIEW_ACCESS_COOKIE)?.value);
  if (!access) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
  } | null;
  const action = asString(body?.action);

  if (!["reject_case", "accept_case"].includes(action)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/portal/review-decision-link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        claimantUserId: access.claimantUserId,
        submissionId: access.submissionId,
        token: access.token,
        action,
      }),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({ error: "backend_unavailable" }));
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ error: "backend_unavailable" }, { status: 502 });
  }
}
