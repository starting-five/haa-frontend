import { getApiBaseUrl } from "@/lib/backend-api";
import { UUID_PATTERN } from "@/lib/constants";
import { parseReviewAccess, REVIEW_ACCESS_COOKIE } from "@/lib/review-access";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// Only these of the backend's headers reach the browser.
const PASSED_HEADERS = ["content-type", "content-disposition"];

const refused = (status: number, error: string) =>
  NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });

// One file of the case under review, for the review page's images and document
// links. The case and the link's token come from the HttpOnly review cookie;
// only the document id comes from the URL, and the backend serves it only if it
// is a file of that case and the link may open files, checked on every request.
// The browser never sees a Storage URL or an object path — both are built from
// the name the patient gave the file, which before acceptance must not reach the
// lawyer.
export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const access = parseReviewAccess((await cookies()).get(REVIEW_ACCESS_COOKIE)?.value);
  if (!access) return refused(401, "unauthorized");
  if (!UUID_PATTERN.test(documentId)) return refused(404, "not_found");

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/portal/review-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claimantUserId: access.claimantUserId,
        submissionId: access.submissionId,
        token: access.token,
        documentId,
      }),
      cache: "no-store",
    });
  } catch {
    return refused(502, "backend_unavailable");
  }

  if (response.status === 401) return refused(401, "unauthorized");
  if (response.status === 403) return refused(403, "documents_unavailable");
  if (response.status === 400 || response.status === 404) return refused(404, "not_found");
  if (!response.ok || !response.body) return refused(502, "backend_unavailable");

  const headers = new Headers();
  for (const name of PASSED_HEADERS) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Referrer-Policy", "no-referrer");
  // Served from the app's own origin, so nothing here may run script in it. A
  // PDF is left out only because a sandboxed document cannot load the browser's
  // PDF viewer; the backend serves a PDF only when Storage holds it as one.
  if (!/^application\/pdf\b/i.test(headers.get("content-type") ?? "")) {
    headers.set("Content-Security-Policy", "sandbox");
  }

  return new Response(response.body, { status: 200, headers });
}
