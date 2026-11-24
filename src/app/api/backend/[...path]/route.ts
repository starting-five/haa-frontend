import { normalizeApiUrl } from "@/lib/backend-api";

// portal/submissions is deliberately absent. It returns every patient's name,
// mobile, email and accident to any caller that is not itself a patient, and
// allowlisting it here made that reachable from the browser by anyone with a
// session — including a self-registered brand ambassador. Nothing in the app
// calls it, and the ambassador People Helped list is served by the scoped
// GET /ambassadors/people instead. Do not add it back without an actor model
// on the backend; see the note in haa-backend middleware/portal.ts.
const allowedGetPaths = new Set(["health", "version", "patient/dashboard", "patient/intake-resume"]);
const allowedPostPaths = new Set([
  "intake",
  "intake/registration-status",
  "intake/start",
  "intake/documents/upload-url",
  "intake/documents/delete",
  "intake/complete",
  "intake/agreement",
  "ambassadors/contact-availability",
  "portal/check-email",
  "portal/register",
  // Admin Dashboard: pass a case to a lawyer, accept or reject it. The backend
  // requires the caller to be in admin_users; any other session gets 403.
  "portal/review-decision",
]);

// Cross-origin callers of this proxy: exact origins (scheme, host and port) from
// BACKEND_PROXY_CORS_ORIGINS, comma-separated. The Admin Dashboard is served from
// its own origin; the patient app is same-origin and needs no entry. There is no
// wildcard — a "*" entry is ignored — and no credentials: callers authenticate
// with a bearer token, which is the only credential the proxy forwards. Unset,
// the proxy answers exactly as before, with no CORS headers at all.
const CORS_ALLOWED_METHODS = "GET, POST, OPTIONS";
const CORS_ALLOWED_HEADERS = "accept, authorization, content-type";
const CORS_MAX_AGE_SECONDS = "600";

function corsAllowedOrigins(): string[] {
  return (process.env.BACKEND_PROXY_CORS_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim().replace(/\/+$/, ""))
    .filter((entry) => {
      try {
        return entry !== "*" && new URL(entry).origin === entry;
      } catch {
        return false;
      }
    });
}

function withCors(request: Request, response: Response): Response {
  const allowed = corsAllowedOrigins();
  if (allowed.length === 0) return response;

  response.headers.append("Vary", "Origin");
  const origin = request.headers.get("origin");
  if (origin && allowed.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }
  return response;
}

function isAllowed(method: "GET" | "POST", path: string): boolean {
  if (method === "GET") {
    return allowedGetPaths.has(path) || /^case\/[^/]+$/.test(path) || /^intake\/agreement\/[^/]+$/.test(path);
  }
  // Case Summary's Save. The backend resolves the case from the caller's own
  // session and refuses anyone else's, so the id in the path authorizes nothing.
  return allowedPostPaths.has(path) || /^case\/[^/]+$/.test(path);
}

async function proxyRequest(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
  method: "GET" | "POST"
) {
  const { path: segments } = await context.params;
  const path = segments.join("/");
  if (!isAllowed(method, path)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const configuredUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!configuredUrl) {
    return Response.json({ error: "backend_not_configured" }, { status: 503 });
  }

  let backendUrl: URL;
  try {
    backendUrl = new URL(normalizeApiUrl(configuredUrl));
  } catch {
    return Response.json({ error: "backend_not_configured" }, { status: 503 });
  }
  if (!["http:", "https:"].includes(backendUrl.protocol)) {
    return Response.json({ error: "backend_not_configured" }, { status: 503 });
  }
  backendUrl.pathname = `${backendUrl.pathname.replace(/\/$/, "")}/${segments.map(encodeURIComponent).join("/")}`;

  const headers = new Headers();
  for (const name of ["accept", "authorization", "content-type"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const response = await fetch(backendUrl, {
      method,
      headers,
      body: method === "POST" ? await request.arrayBuffer() : undefined,
      cache: "no-store",
    });
    const responseHeaders = new Headers();
    const contentType = response.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ error: "backend_unavailable" }, { status: 502 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return withCors(request, await proxyRequest(request, context, "GET"));
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return withCors(request, await proxyRequest(request, context, "POST"));
}

// The browser's preflight for a cross-origin call. An origin that is not allowed
// gets the same answer as before — no CORS headers — so its browser refuses.
export function OPTIONS(request: Request) {
  const response = new Response(null, { status: 204, headers: { Allow: "GET, HEAD, OPTIONS, POST" } });
  const origin = request.headers.get("origin");
  if (origin && corsAllowedOrigins().includes(origin)) {
    response.headers.set("Access-Control-Allow-Methods", CORS_ALLOWED_METHODS);
    response.headers.set("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS);
    response.headers.set("Access-Control-Max-Age", CORS_MAX_AGE_SECONDS);
  }
  return withCors(request, response);
}
