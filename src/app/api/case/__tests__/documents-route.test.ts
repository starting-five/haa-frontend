import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Case Summary's thumbnails: one file of the signed-in patient's own case,
// passed on from the app's origin. The session comes from the request cookies
// (the server Supabase client), the case and document only from the URL, and
// the backend decides whether the case is the caller's. These tests pin that no
// request reaches the backend without a session or with a malformed id, that
// only the file's type and disposition come back, and that the app adds its
// own protections.

const SUBMISSION = "9b2e7c41-5d6a-4f38-8e1b-2c7d9a0f3e55";
const DOCUMENT = "1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b";

const auth = vi.hoisted(() => ({ accessToken: "patient-access-token" as string | null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getSession: async () => ({
        data: { session: auth.accessToken ? { access_token: auth.accessToken } : null },
        error: null,
      }),
    },
  }),
}));

const originalEnv = { ...process.env };
const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  auth.accessToken = "patient-access-token";
  vi.stubGlobal("fetch", fetchMock);
  process.env.API_URL = "http://backend:4000";
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("GET /api/case/[submissionId]/documents/[documentId]", () => {
  const open = async (submissionId: string, documentId: string) => {
    const { GET } = await import("../[submissionId]/documents/[documentId]/route");
    return GET(new Request(`https://beta.example.test/api/case/${submissionId}/documents/${documentId}`), {
      params: Promise.resolve({ submissionId, documentId }),
    });
  };
  const fileAnswer = (type: string, disposition: string, extra: Record<string, string> = {}) =>
    new Response(new Uint8Array([137, 80, 78, 71]), {
      status: 200,
      headers: { "Content-Type": type, "Content-Disposition": disposition, ...extra },
    });

  it("asks the backend for that case's document with the patient's own session", async () => {
    fetchMock.mockResolvedValue(fileAnswer("image/png", 'inline; filename="card.png"'));

    const response = await open(SUBMISSION, DOCUMENT);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(`http://backend:4000/case/${SUBMISSION}/documents/${DOCUMENT}`);
    expect(init?.headers).toEqual({ Authorization: "Bearer patient-access-token" });
    expect(init?.cache).toBe("no-store");
    expect(response.status).toBe(200);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([137, 80, 78, 71]);
  });

  it("passes on only the file's type and disposition, and adds its own protections", async () => {
    fetchMock.mockResolvedValue(
      fileAnswer("image/webp", 'inline; filename="card.webp"', {
        "Set-Cookie": "sb-project-auth-token=stolen; Path=/",
        "Access-Control-Allow-Origin": "*",
        "X-Powered-By": "Express",
        "Content-Location": "https://project.supabase.co/storage/v1/object/sign/submissions/x.webp?token=y",
      })
    );

    const response = await open(SUBMISSION, DOCUMENT);

    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="card.webp"');
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("x-powered-by")).toBeNull();
    expect(response.headers.get("content-location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toBe("sandbox");
  });

  it("serves a PDF without the sandbox, so the browser's own viewer can open it", async () => {
    fetchMock.mockResolvedValue(fileAnswer("application/pdf", 'inline; filename="report.pdf"'));

    const response = await open(SUBMISSION, DOCUMENT);

    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-security-policy")).toBeNull();
  });

  it("answers 401 without asking the backend when there is no session", async () => {
    auth.accessToken = null;

    expect((await open(SUBMISSION, DOCUMENT)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["../../portal/submissions", DOCUMENT],
    [SUBMISSION, "not-a-uuid"],
    [SUBMISSION, `${DOCUMENT}/../x`],
    [`${SUBMISSION}' or '1'='1`, DOCUMENT],
    ["", DOCUMENT],
  ])("answers 404 without asking the backend for %j / %j", async (submissionId, documentId) => {
    expect((await open(submissionId, documentId)).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, 401],
    [404, 404],
    [400, 404],
    [500, 502],
  ])("answers a backend %i with %i and none of the backend's body", async (backendStatus, expected) => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: "Document not found", storagePath: `${SUBMISSION}/insuranceCard/x.png` },
        { status: backendStatus }
      )
    );

    const response = await open(SUBMISSION, DOCUMENT);

    expect(response.status).toBe(expected);
    expect(await response.text()).not.toContain("storagePath");
  });

  it("answers 502 when the backend cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    expect((await open(SUBMISSION, DOCUMENT)).status).toBe(502);
  });
});
