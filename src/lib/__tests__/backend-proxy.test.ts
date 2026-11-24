import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/backend/[...path]/route";

describe("same-origin backend proxy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("forwards an allowed request to the runtime API_URL", async () => {
    vi.stubEnv("API_URL", "https://backend.example.com/");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const response = await GET(new Request("https://frontend.example.com/api/backend/health"), {
      params: Promise.resolve({ path: ["health"] }),
    });

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://backend.example.com/health");
  });

  // Without an allowlist entry the frontend answers 404 itself and the backend
  // is never reached, so the version of the deployed API would be unreadable
  // through the same origin the browser already uses.
  it("forwards the backend version request", async () => {
    vi.stubEnv("API_URL", "https://backend.example.com/");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ application: "haa-backend", version: "1.0.0-rc.6" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const response = await GET(new Request("https://frontend.example.com/api/backend/version"), {
      params: Promise.resolve({ path: ["version"] }),
    });

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://backend.example.com/version");
    await expect(response.json()).resolves.toMatchObject({ application: "haa-backend" });
  });

  it("forwards the evidence upload URL request", async () => {
    vi.stubEnv("API_URL", "https://backend.example.com");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ bucket: "submissions", storagePath: "id/cat/file.png", token: "t" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const response = await POST(
      new Request("https://frontend.example.com/api/backend/intake/documents/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submissionId: "id", fileName: "file.png" }),
      }),
      { params: Promise.resolve({ path: ["intake", "documents", "upload-url"] }) }
    );

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://backend.example.com/intake/documents/upload-url");
  });

  it("forwards the evidence delete request", async () => {
    vi.stubEnv("API_URL", "https://backend.example.com");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    const response = await POST(
      new Request("https://frontend.example.com/api/backend/intake/documents/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          submissionId: "id",
          storagePath: "id/accidentReport/haa-people-de6b2588.png",
        }),
      }),
      { params: Promise.resolve({ path: ["intake", "documents", "delete"] }) }
    );

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://backend.example.com/intake/documents/delete");
  });

  it("forwards the agreement creation request", async () => {
    vi.stubEnv("API_URL", "https://backend.example.com");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "sent", signingUrl: "https://demo.docusign.net/signing/x" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    );

    const response = await POST(
      new Request("https://frontend.example.com/api/backend/intake/agreement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submissionId: "11111111-2222-4333-8444-555555555555" }),
      }),
      { params: Promise.resolve({ path: ["intake", "agreement"] }) }
    );

    expect(response.status).toBe(201);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://backend.example.com/intake/agreement");
  });

  it("forwards the agreement status request", async () => {
    vi.stubEnv("API_URL", "https://backend.example.com");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "completed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const response = await GET(new Request("https://frontend.example.com/api/backend/intake/agreement/abc-123"), {
      params: Promise.resolve({ path: ["intake", "agreement", "abc-123"] }),
    });

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://backend.example.com/intake/agreement/abc-123");
  });

  it("does not widen the agreement routes beyond the two allowed shapes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    // A status read is GET-only; POSTing to it must not reach the backend.
    const postToStatus = await POST(
      new Request("https://frontend.example.com/api/backend/intake/agreement/abc-123", { method: "POST" }),
      { params: Promise.resolve({ path: ["intake", "agreement", "abc-123"] }) }
    );

    // Creation is POST-only.
    const getOnCreate = await GET(new Request("https://frontend.example.com/api/backend/intake/agreement"), {
      params: Promise.resolve({ path: ["intake", "agreement"] }),
    });

    // The pattern matches one segment, so it cannot be used to walk deeper.
    const nested = await GET(
      new Request("https://frontend.example.com/api/backend/intake/agreement/abc-123/envelope"),
      { params: Promise.resolve({ path: ["intake", "agreement", "abc-123", "envelope"] }) }
    );

    expect(postToStatus.status).toBe(404);
    expect(getOnCreate.status).toBe(404);
    expect(nested.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the registration status request", async () => {
    vi.stubEnv("API_URL", "https://backend.example.com");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "existing" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const response = await POST(
      new Request("https://frontend.example.com/api/backend/intake/registration-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "+14075551234" }),
      }),
      { params: Promise.resolve({ path: ["intake", "registration-status"] }) }
    );

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://backend.example.com/intake/registration-status");
  });

  it("does not expose the OTP endpoint to POST", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("https://frontend.example.com/api/backend/intake/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "+15550100123", code: "111111" }),
      }),
      { params: Promise.resolve({ path: ["intake", "verify-otp"] }) }
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not expose the OTP endpoint to GET", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await GET(new Request("https://frontend.example.com/api/backend/intake/verify-otp"), {
      params: Promise.resolve({ path: ["intake", "verify-otp"] }),
    });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not expose arbitrary backend paths", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await POST(new Request("https://frontend.example.com/api/backend/admin"), {
      params: Promise.resolve({ path: ["admin"] }),
    });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
