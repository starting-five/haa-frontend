import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The lawyer review link's two routes.
//
// unlock-link turns a verified link into the HttpOnly review cookie. The cookie
// keeps the token, not what verify said about it, because the review page asks
// the backend again on every render.
//
// decision records Accept or Reject. Only the action comes from the browser:
// the case and the token come from the cookie, and the backend finds the
// assignment from the token. These tests pin that nothing in the request can
// point a decision at another case, and that no decision leaves without a token.

const CLAIMANT = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const SUBMISSION = "9b2e7c41-5d6a-4f38-8e1b-2c7d9a0f3e55";
const OTHER_SUBMISSION = "0d9f6a2e-1c3b-4e5d-8f70-9a1b2c3d4e5f";
const TOKEN = "qH3kz1YtV0cP7mR2sB8nW4dL6fJ9xA5e";

const jar = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.cookies.has(name) ? { name, value: jar.cookies.get(name) } : undefined),
  }),
}));

const originalEnv = { ...process.env };
const fetchMock = vi.fn();

const cookieOf = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const readCookie = (header: string | null) => {
  const value = header?.match(/haa_review_access=([^;]*)/)?.[1] ?? "";
  return value
    ? (JSON.parse(Buffer.from(decodeURIComponent(value), "base64url").toString("utf8")) as Record<string, unknown>)
    : null;
};

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  jar.cookies.clear();
  vi.stubGlobal("fetch", fetchMock);
  process.env.API_URL = "http://backend:4000";
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("GET /api/review/unlock-link", () => {
  const open = async (query: string) => {
    const { GET } = await import("../unlock-link/route");
    return GET(new Request(`https://beta.example.test/api/review/unlock-link?${query}`));
  };
  const linkQuery = `claimantUserId=${CLAIMANT}&submissionId=${SUBMISSION}&t=${TOKEN}&next=${encodeURIComponent(`/es/review/${CLAIMANT}?submissionId=${SUBMISSION}`)}`;

  it("keeps the verified link's ids and token in an HttpOnly cookie, and nothing it was told", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        ok: true,
        assignmentId: "3f1c2b8e-8f5d-4c0a-9d3e-0b6a1e2f4c11",
        submissionId: SUBMISSION,
        claimantUserId: CLAIMANT,
        status: "pending",
        canDecide: true,
      })
    );

    const response = await open(linkQuery);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `https://beta.example.test/es/review/${CLAIMANT}?submissionId=${SUBMISSION}`
    );
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(readCookie(setCookie)).toEqual({ claimantUserId: CLAIMANT, submissionId: SUBMISSION, token: TOKEN });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://backend:4000/portal/review-access/verify");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      claimantUserId: CLAIMANT,
      submissionId: SUBMISSION,
      token: TOKEN,
    });
  });

  it("sets no cookie for a link the backend refuses, and clears an old one", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "invalid_token" }, { status: 401 }));

    const response = await open(linkQuery);

    expect(response.headers.get("location")).toBe("https://beta.example.test/");
    expect(readCookie(response.headers.get("set-cookie"))).toBeNull();
    expect(response.headers.get("set-cookie")).toMatch(/haa_review_access=;/);
  });

  it("does not ask the backend about a link with no token", async () => {
    const response = await open(`claimantUserId=${CLAIMANT}&submissionId=${SUBMISSION}`);

    expect(response.headers.get("location")).toBe("https://beta.example.test/");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readCookie(response.headers.get("set-cookie"))).toBeNull();
  });

  // A verified link lands on its own case's review page and nowhere else. Only
  // the locale is read from `next`; everything else in it is ignored.
  describe("the destination after a verified link", () => {
    const OWN_EN = `https://beta.example.test/en/review/${CLAIMANT}?submissionId=${SUBMISSION}`;
    const OWN_ES = `https://beta.example.test/es/review/${CLAIMANT}?submissionId=${SUBMISSION}`;
    const landAfter = async (next: string, raw = false) => {
      fetchMock.mockResolvedValue(
        Response.json({ ok: true, assignmentId: "a", submissionId: SUBMISSION, claimantUserId: CLAIMANT })
      );
      const response = await open(
        `claimantUserId=${CLAIMANT}&submissionId=${SUBMISSION}&t=${TOKEN}&next=${raw ? next : encodeURIComponent(next)}`
      );
      return response.headers.get("location") ?? "";
    };

    it("keeps a legitimate English review destination", async () => {
      expect(await landAfter(`/en/review/${CLAIMANT}?submissionId=${SUBMISSION}`)).toBe(OWN_EN);
    });

    it("keeps a legitimate Spanish review destination", async () => {
      expect(await landAfter(`/es/review/${CLAIMANT}?submissionId=${SUBMISSION}`)).toBe(OWN_ES);
    });

    it.each([
      ["an absolute URL", "https://evil.example"],
      ["an absolute URL with a review-looking path", "https://evil.example/es/review/x"],
      ["protocol-relative", "//evil.example"],
      ["triple slash", "///evil.example"],
      ["slash-backslash", "/\\evil.example"],
      ["backslash only", "\\evil.example"],
      ["double backslash", "\\\\evil.example"],
      ["slash, tab, slash", "/\t/evil.example"],
      ["slash, newline, slash", "/\n/evil.example"],
      ["a scheme without slashes", "http:evil.example"],
      ["javascript:", "javascript:alert(1)"],
      ["data:", "data:text/html,<script>alert(1)</script>"],
      ["parent directories", "/en/review/../../evil.example"],
      ["a locale-prefixed backslash", "/es\\evil.example"],
      [
        "another case's review page",
        "/en/review/11111111-1111-4111-8111-111111111111?submissionId=22222222-2222-4222-8222-222222222222",
      ],
      ["a malformed percent sequence", "/%E0%A4%A"],
      ["empty", ""],
    ])("sends %s to this case's own review page, never elsewhere", async (_label, next) => {
      const location = await landAfter(next);
      // Spanish only when next starts with exactly "/es/"; anything else is English.
      expect(location).toBe(/^\/es(\/|$)/.test(next) ? OWN_ES : OWN_EN);
      expect(new URL(location).origin).toBe("https://beta.example.test");
    });

    it.each([
      ["encoded protocol-relative", "%2F%2Fevil.example"],
      ["encoded backslash", "%2F%5Cevil.example"],
      ["encoded tab", "%2F%09%2Fevil.example"],
      ["double-encoded protocol-relative", "%252F%252Fevil.example"],
      ["double-encoded backslash", "%252F%255Cevil.example"],
      ["an encoded absolute URL", "https%3A%2F%2Fevil.example"],
    ])("sends %s to this case's own review page, never elsewhere", async (_label, rawNext) => {
      const location = await landAfter(rawNext, true);
      expect(location).toBe(OWN_EN);
      expect(new URL(location).origin).toBe("https://beta.example.test");
    });

    it("refuses ids that are not UUIDs, so they never reach a path", async () => {
      const response = await open(
        `claimantUserId=${encodeURIComponent("../evil")}&submissionId=${SUBMISSION}&t=${TOKEN}&next=${encodeURIComponent("/en/review/x")}`
      );
      expect(response.headers.get("location")).toBe("https://beta.example.test/");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("still sends a refused link home, whatever next says", async () => {
      fetchMock.mockResolvedValue(Response.json({ error: "invalid_token" }, { status: 401 }));
      const response = await open(
        `claimantUserId=${CLAIMANT}&submissionId=${SUBMISSION}&t=${TOKEN}&next=${encodeURIComponent("/\\evil.example")}`
      );
      expect(response.headers.get("location")).toBe("https://beta.example.test/");
    });
  });
});

describe("POST /api/review/decision", () => {
  const decide = async (body: unknown) => {
    const { POST } = await import("../decision/route");
    return POST(
      new Request("https://beta.example.test/api/review/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  };

  it("sends the cookie's case and token with the action, and nothing from the request", async () => {
    jar.cookies.set(
      "haa_review_access",
      cookieOf({ claimantUserId: CLAIMANT, submissionId: SUBMISSION, token: TOKEN })
    );
    fetchMock.mockResolvedValue(Response.json({ ok: true, action: "accept_case", status: "qualified" }));

    const response = await decide({
      action: "accept_case",
      claimantUserId: "11111111-1111-4111-8111-111111111111",
      submissionId: OTHER_SUBMISSION,
      assignmentId: "22222222-2222-4222-8222-222222222222",
      token: "a-token-the-browser-chose",
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://backend:4000/portal/review-decision-link");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      claimantUserId: CLAIMANT,
      submissionId: SUBMISSION,
      token: TOKEN,
      action: "accept_case",
    });
  });

  it("refuses without a cookie, and never reaches the backend", async () => {
    const response = await decide({ action: "accept_case" });

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses the old cookie, which has no token, whatever it claims", async () => {
    jar.cookies.set(
      "haa_review_access",
      cookieOf({
        claimantUserId: CLAIMANT,
        submissionId: SUBMISSION,
        assignmentId: "3f1c2b8e-8f5d-4c0a-9d3e-0b6a1e2f4c11",
        status: "pending",
        canDecide: true,
      })
    );

    const response = await decide({ action: "accept_case" });

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an action other than accept or reject", async () => {
    jar.cookies.set(
      "haa_review_access",
      cookieOf({ claimantUserId: CLAIMANT, submissionId: SUBMISSION, token: TOKEN })
    );

    const response = await decide({ action: "pass_to_lawyer" });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes the backend's refusal of a late or foreign decision straight back", async () => {
    jar.cookies.set(
      "haa_review_access",
      cookieOf({ claimantUserId: CLAIMANT, submissionId: SUBMISSION, token: TOKEN })
    );
    fetchMock.mockResolvedValue(Response.json({ error: "assignment_not_active" }, { status: 401 }));

    const response = await decide({ action: "reject_case" });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "assignment_not_active" });
  });
});

// documents/[documentId] streams one file of the case to the review page. The
// case and the token come from the cookie; only the document id comes from the
// URL. Nothing of the backend's answer reaches the browser except the file, its
// type and its disposition — no Storage URL, no cookie, no CORS grant.
describe("GET /api/review/documents/[documentId]", () => {
  const DOCUMENT = "1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b";
  const open = async (documentId: string, url = `https://beta.example.test/api/review/documents/${documentId}`) => {
    const { GET } = await import("../documents/[documentId]/route");
    return GET(new Request(url), { params: Promise.resolve({ documentId }) });
  };
  const fileAnswer = (type: string, disposition: string, extra: Record<string, string> = {}) =>
    new Response(new Uint8Array([37, 80, 68, 70]), {
      status: 200,
      headers: { "Content-Type": type, "Content-Disposition": disposition, ...extra },
    });

  beforeEach(() => {
    jar.cookies.set(
      "haa_review_access",
      cookieOf({ claimantUserId: CLAIMANT, submissionId: SUBMISSION, token: TOKEN })
    );
  });

  it("asks the backend for the cookie's case with the cookie's token, and only the document id from the URL", async () => {
    fetchMock.mockResolvedValue(fileAnswer("application/pdf", 'inline; filename="insurance-card-1e2f3a4b.pdf"'));

    const response = await open(
      DOCUMENT,
      `https://beta.example.test/api/review/documents/${DOCUMENT}?submissionId=${OTHER_SUBMISSION}&claimantUserId=${OTHER_SUBMISSION}&token=forged`
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://backend:4000/portal/review-document");
    expect(init?.method).toBe("POST");
    expect(init?.cache).toBe("no-store");
    expect(JSON.parse(String(init?.body))).toEqual({
      claimantUserId: CLAIMANT,
      submissionId: SUBMISSION,
      token: TOKEN,
      documentId: DOCUMENT,
    });
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).toString("latin1")).toBe("%PDF");
  });

  it("passes on only the file's type and disposition, and adds its own protections", async () => {
    fetchMock.mockResolvedValue(
      fileAnswer("image/webp", 'inline; filename="incident-photo-1e2f3a4b.webp"', {
        "Set-Cookie": "sb-project-auth-token=stolen; Path=/",
        "Access-Control-Allow-Origin": "*",
        "X-Powered-By": "Express",
        "Content-Location": "https://project.supabase.co/storage/v1/object/sign/submissions/x.webp?token=y",
      })
    );

    const response = await open(DOCUMENT);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="incident-photo-1e2f3a4b.webp"');
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

  it("keeps a download opaque and sandboxed", async () => {
    fetchMock.mockResolvedValue(
      fileAnswer("application/octet-stream", 'attachment; filename="incident-photo-1e2f3a4b.heic"')
    );

    const response = await open(DOCUMENT);

    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(response.headers.get("content-security-policy")).toBe("sandbox");
  });

  it("serves a PDF without the sandbox, so the browser's own viewer can open it", async () => {
    fetchMock.mockResolvedValue(fileAnswer("application/pdf", 'inline; filename="insurance-card-1e2f3a4b.pdf"'));

    const response = await open(DOCUMENT);

    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("answers 401 without asking the backend when there is no cookie, or the old one without a token", async () => {
    jar.cookies.clear();
    expect((await open(DOCUMENT)).status).toBe(401);

    jar.cookies.set("haa_review_access", cookieOf({ claimantUserId: CLAIMANT, submissionId: SUBMISSION }));
    expect((await open(DOCUMENT)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["../../portal/submissions", "not-a-uuid", `${DOCUMENT}' or '1'='1`, `${DOCUMENT}/../x`, ""])(
    "answers 404 without asking the backend for the id %j",
    async (documentId) => {
      const response = await open(documentId);
      expect(response.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each([
    [401, 401],
    [403, 403],
    [404, 404],
    [400, 404],
    [500, 502],
  ])("answers a backend %i with %i and none of the backend's body", async (backendStatus, expected) => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: "document_not_found", storagePath: `${SUBMISSION}/driversLicense/Maria_Lopez_license.png` },
        { status: backendStatus }
      )
    );

    const response = await open(DOCUMENT);
    const text = await response.text();

    expect(response.status).toBe(expected);
    expect(text).not.toContain("Maria_Lopez");
    expect(text).not.toContain(SUBMISSION);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("answers 502 when the backend cannot be reached", async () => {
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED"));
    expect((await open(DOCUMENT)).status).toBe(502);
  });
});

// retainer streams the case's signed retainer to a lawyer who has accepted it.
// The case and the token come from the cookie and nothing comes from the URL:
// there is no id, so there is nothing to guess. The backend decides whether the
// link may open it; this route passes on a PDF and nothing else.
describe("GET /api/review/retainer", () => {
  const open = async () => {
    const { GET } = await import("../retainer/route");
    return GET();
  };
  const pdfAnswer = (extra: Record<string, string> = {}) =>
    new Response(new Uint8Array([37, 80, 68, 70, 45]), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="Signed Retainer.pdf"',
        ...extra,
      },
    });

  beforeEach(() => {
    jar.cookies.set(
      "haa_review_access",
      cookieOf({ claimantUserId: CLAIMANT, submissionId: SUBMISSION, token: TOKEN })
    );
  });

  it("asks the backend for the cookie's case with the cookie's token, and nothing else", async () => {
    fetchMock.mockResolvedValue(pdfAnswer());

    const response = await open();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://backend:4000/portal/review-retainer");
    expect(init?.method).toBe("POST");
    expect(init?.cache).toBe("no-store");
    expect(JSON.parse(String(init?.body))).toEqual({
      claimantUserId: CLAIMANT,
      submissionId: SUBMISSION,
      token: TOKEN,
    });
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).toString("latin1")).toBe("%PDF-");
  });

  it("serves it as an inline PDF under the neutral name, passing on nothing else of the backend's answer", async () => {
    fetchMock.mockResolvedValue(
      pdfAnswer({
        "Set-Cookie": "sb-project-auth-token=stolen; Path=/",
        "Access-Control-Allow-Origin": "*",
        "X-Powered-By": "Express",
        Location: "https://x.supabase.co/storage/v1/object/sign/agreements/a.pdf",
      })
    );

    const response = await open();

    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="Signed Retainer.pdf"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("x-powered-by")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not pass on anything the backend sends that is not a PDF", async () => {
    fetchMock.mockResolvedValue(
      new Response("<script>alert(1)</script>", { status: 200, headers: { "Content-Type": "text/html" } })
    );

    const response = await open();

    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("<script>");
  });

  it("answers 401 without asking the backend when there is no cookie, or a cookie without a token", async () => {
    jar.cookies.clear();
    expect((await open()).status).toBe(401);
    jar.cookies.set("haa_review_access", cookieOf({ claimantUserId: CLAIMANT, submissionId: SUBMISSION }));
    expect((await open()).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes on the backend's refusal before acceptance, and never a file", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "retainer_unavailable" }), { status: 403 }));

    const response = await open();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "retainer_unavailable" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("maps a revoked or foreign link to 401 and a missing retainer to 404", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "token_revoked" }), { status: 401 }));
    expect((await open()).status).toBe(401);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "retainer_not_found" }), { status: 404 }));
    expect((await open()).status).toBe(404);
  });

  it("answers 502 when the backend cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    expect((await open()).status).toBe(502);
  });
});
