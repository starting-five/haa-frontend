import { getApiBaseUrl } from "@/lib/backend-api";
import { parseReviewAccess, REVIEW_ACCESS_COOKIE } from "@/lib/review-access";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const refused = (status: number, error: string) =>
  NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });

// The patient's signed retainer, for a lawyer who has accepted the case. The
// case and the link's token come from the HttpOnly review cookie and nothing
// else is read — there is no id in the URL. The backend resolves the retainer
// from that case's own agreement and serves it only to an accepted link,
// checked on every request. The browser never sees a Storage URL, an object
// path or an agreement id.
export async function GET() {
  const access = parseReviewAccess((await cookies()).get(REVIEW_ACCESS_COOKIE)?.value);
  if (!access) return refused(401, "unauthorized");

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/portal/review-retainer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claimantUserId: access.claimantUserId,
        submissionId: access.submissionId,
        token: access.token,
      }),
      cache: "no-store",
    });
  } catch {
    return refused(502, "backend_unavailable");
  }

  if (response.status === 401) return refused(401, "unauthorized");
  if (response.status === 403) return refused(403, "retainer_unavailable");
  if (response.status === 400 || response.status === 404) return refused(404, "not_found");
  if (!response.ok || !response.body) return refused(502, "backend_unavailable");
  // Only ever a PDF; anything else the backend sent is not passed on.
  if (!/^application\/pdf\b/i.test(response.headers.get("content-type") ?? "")) {
    return refused(502, "backend_unavailable");
  }

  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Disposition": response.headers.get("content-disposition") ?? 'inline; filename="Signed Retainer.pdf"',
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
  });

  return new Response(response.body, { status: 200, headers });
}
