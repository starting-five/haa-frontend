import { getApiBaseUrl } from "@/lib/backend-api";
import { UUID_PATTERN } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Only these of the backend's headers reach the browser.
const PASSED_HEADERS = ["content-type", "content-disposition"];

const refused = (status: number, error: string) =>
  NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });

// One file of the signed-in patient's own case, for Case Summary's thumbnails.
// The evidence bucket has no read policy, so the browser cannot fetch even its
// own uploads; the backend reads the file after checking the case is the
// caller's, and this passes it on from the app's own origin. The session comes
// from the request cookies; the browser never sees a Storage URL. Hardened the
// same way as the lawyer's /api/review/documents/[documentId].
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ submissionId: string; documentId: string }> }
) {
  const { submissionId, documentId } = await params;
  if (!UUID_PATTERN.test(submissionId) || !UUID_PATTERN.test(documentId)) return refused(404, "not_found");

  const {
    data: { session },
  } = await (await createClient()).auth.getSession();
  if (!session?.access_token) return refused(401, "unauthorized");

  let response: Response;
  try {
    response = await fetch(
      `${getApiBaseUrl()}/case/${encodeURIComponent(submissionId)}/documents/${encodeURIComponent(documentId)}`,
      { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }
    );
  } catch {
    return refused(502, "backend_unavailable");
  }

  if (response.status === 401) return refused(401, "unauthorized");
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
