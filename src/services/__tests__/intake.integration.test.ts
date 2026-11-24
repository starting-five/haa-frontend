import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The protected routes read the session from the browser Supabase client, so it
// is stubbed here rather than configured — these tests assert what the service
// sends, and a real client would only add environment to the failure modes.
const session: { access_token: string } | null = { access_token: "stub-access-token" };
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session } }) } }),
}));

/** The Authorization header actually sent on a mocked fetch call. */
const sentAuthorization = (init: RequestInit | undefined) =>
  (init?.headers as Record<string, string> | undefined)?.Authorization;

describe("intake service integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("submits intake payload to the backend", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ submissionId: "submission-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { submitIntake } = await import("../intake");

    const payload = {
      submissionId: "submission-123",
      locale: "en",
      claimant: {
        firstName: "John",
        lastName: "Doe",
        mobile: "1234567890",
        consent: true as const,
      },
      accident: {
        incidentType: "car-accident",
        incidentDate: "2026-08-19",
        incidentLocation: "New York",
      },
      documents: [],
    };

    await submitIntake(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/intake",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
    );
  });

  it("throws backend error when intake submission fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid intake" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      })
    );

    const { submitIntake } = await import("../intake");

    const payload = {
      submissionId: "submission-123",
      locale: "en",
      claimant: {
        firstName: "John",
        lastName: "Doe",
        mobile: "1234567890",
        consent: true as const,
      },
      accident: {
        incidentType: "car-accident",
        incidentDate: "2026-08-19",
        incidentLocation: "New York",
      },
      documents: [],
    };

    await expect(submitIntake(payload)).rejects.toThrow("Invalid intake");
  });

  it("loads portal submissions with bearer authentication", async () => {
    const response = [
      {
        id: "submission-123",
        status: "submitted",
        submitted_at: "2026-08-20T10:00:00Z",
        locale: "en",
        claimant: null,
        accident: null,
      },
    ];

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    );

    const { getSubmissions } = await import("../intake");

    const result = await getSubmissions("test-access-token");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/portal/submissions", {
      headers: {
        Authorization: "Bearer test-access-token",
      },
    });

    expect(result).toEqual(response);
  });

  it("loads a case by submission id", async () => {
    const response = {
      submissionId: "submission-123",
      status: "submitted",
      submittedAt: "2026-08-20T10:00:00Z",
      firstName: "John",
      incidentType: "car-accident",
      incidentDate: "2026-08-19",
      incidentLocation: "New York",
    };

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    );

    const { getCase } = await import("../intake");

    const result = await getCase("submission-123");

    // The case summary carries the patient's name and injury, so it is fetched
    // as the patient rather than as anyone holding the id.
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://localhost:4000/case/submission-123");
    expect(sentAuthorization(fetchMock.mock.calls[0][1])).toBe("Bearer stub-access-token");

    expect(result).toEqual(response);
  });

  it("rejects an incompatible case API response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          submissionId: "submission-123",
          status: "submitted",
          submittedAt: "2026-08-20T10:00:00Z",

          // Simulates a breaking backend contract change:
          first_name: "John",

          incidentType: "car-accident",
          incidentDate: "2026-08-19",
          incidentLocation: "New York",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      )
    );

    const { getCase } = await import("../intake");

    await expect(getCase("submission-123")).rejects.toThrow();
  });

  it("checks portal email and returns approved status", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "approved" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { checkEmail } = await import("../intake");

    const payload = {
      email: "lawyer@example.com",
      firstName: "Jane",
      lastName: "Smith",
      mobile: "5550001234",
      practice: "Personal Injury",
      role: "lawyer",
    };

    const result = await checkEmail(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/portal/check-email",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );
    expect(result).toEqual({ status: "approved" });
  });

  it("checks portal email and returns waitlist status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "waitlist" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { checkEmail } = await import("../intake");

    const result = await checkEmail({
      email: "lawyer@example.com",
      firstName: "Jane",
      lastName: "Smith",
      mobile: "5550001234",
      role: "lawyer",
    });

    expect(result).toEqual({ status: "waitlist" });
  });

  it("rejects an incompatible check-email response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        // Simulates a breaking backend contract change: status field renamed
        JSON.stringify({ result: "approved" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const { checkEmail } = await import("../intake");

    await expect(
      checkEmail({ email: "x@x.com", firstName: "A", lastName: "B", mobile: "1", role: "lawyer" })
    ).rejects.toThrow();
  });

  it("registers a portal user and returns approved status", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "approved", userId: "user-123" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { register } = await import("../intake");

    const payload = {
      email: "lawyer@example.com",
      firstName: "Jane",
      lastName: "Smith",
      password: "Secret1!",
    };

    const result = await register(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/portal/register",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );
    expect(result).toEqual({ status: "approved", userId: "user-123" });
  });

  it("register returns account_exists error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "account_exists", message: "Account already exists" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { register } = await import("../intake");

    const result = await register({
      email: "existing@example.com",
      firstName: "Jane",
      lastName: "Smith",
      password: "Secret1!",
    });

    expect(result).toEqual({ error: "account_exists", message: "Account already exists" });
  });

  it("rejects an incompatible register response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        // Simulates a breaking backend contract change: status field removed
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const { register } = await import("../intake");

    await expect(register({ email: "x@x.com", firstName: "A", lastName: "B", password: "pass" })).rejects.toThrow();
  });

  it("throws a clear error for a failed check-email request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_email", message: "Email is invalid" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { checkEmail } = await import("../intake");

    await expect(
      checkEmail({ email: "x", firstName: "A", lastName: "B", mobile: "1", role: "lawyer" })
    ).rejects.toThrow("Email is invalid");
  });

  it("normalizes a trailing slash in the configured API URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000///");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "approved" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { checkEmail } = await import("../intake");
    await checkEmail({ email: "x@x.com", firstName: "A", lastName: "B", mobile: "1", role: "lawyer" });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/portal/check-email", expect.any(Object));
  });

  it("carries the session when completing an intake", async () => {
    // /intake/complete rewrites the claimant, the accident and the submission's
    // status, so it must never act on an id alone.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    const { completeIntake } = await import("../intake");
    await completeIntake({
      submissionId: "submission-123",
      claimant: { residence: "Austin, TX" },
      accident: { incidentType: "car", incidentDate: "2026-09-05", incidentLocation: "San Diego, CA" },
      documents: [],
    });

    expect(sentAuthorization(fetchMock.mock.calls[0][1])).toBe("Bearer stub-access-token");
  });

  it("lets a server component supply the session explicitly", async () => {
    // Server components have no browser client to read a session from, so the
    // case page passes the token it read from the request cookies.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          submissionId: "submission-123",
          status: "submitted",
          submittedAt: null,
          firstName: "John",
          incidentType: "car",
          incidentLocation: "San Diego, CA",
          role: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const { getCase } = await import("../intake");
    await getCase("submission-123", "server-side-token");

    expect(sentAuthorization(fetchMock.mock.calls[0][1])).toBe("Bearer server-side-token");
  });

  it("posts complete-intake documents with the category preserved", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 200,
      })
    );

    const { completeIntake } = await import("../intake");

    await completeIntake({
      submissionId: "submission-123",
      claimant: {
        residence: "Austin, TX",
      },
      accident: {
        incidentType: "car",
        incidentDate: "2026-08-19",
        incidentLocation: "Austin",
        role: "driver",
      },
      treatmentArea: "Austin, TX",
      companions: [
        {
          firstName: "Jane",
          lastName: "Doe",
          relation: "passenger",
          cellNumber: "(555) 000-1111",
          email: "jane@example.com",
        },
      ],
      documents: [
        {
          fileName: "accident-report.pdf",
          storagePath: "submission-123/accidentReport/accident-report.pdf",
          mimeType: "application/pdf",
          fileSize: 2048,
          category: "accidentReport",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/intake/complete",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer stub-access-token" },
        body: JSON.stringify({
          submissionId: "submission-123",
          claimant: {
            residence: "Austin, TX",
          },
          accident: {
            incidentType: "car",
            incidentDate: "2026-08-19",
            incidentLocation: "Austin",
            role: "driver",
          },
          treatmentArea: "Austin, TX",
          companions: [
            {
              firstName: "Jane",
              lastName: "Doe",
              relation: "passenger",
              cellNumber: "(555) 000-1111",
              email: "jane@example.com",
            },
          ],
          documents: [
            {
              fileName: "accident-report.pdf",
              storagePath: "submission-123/accidentReport/accident-report.pdf",
              mimeType: "application/pdf",
              fileSize: 2048,
              // The category the patient picked on the evidence screen has to
              // survive the contract parse and reach the backend, which stores
              // it as documents.category.
              category: "accidentReport",
            },
          ],
        }),
      })
    );
  });
  it("carries the session when starting an intake", async () => {
    // /intake/start binds the claimant to whoever the token says is calling, so
    // a request without one cannot identify a patient at all.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ submissionId: "submission-123" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { startIntake } = await import("../intake");
    await startIntake({
      locale: "en",
      claimant: { firstName: "John", lastName: "Doe", mobile: "+15550100123" },
      accident: { incidentType: "car", incidentLocation: "San Diego, CA", incidentDate: "2026-09-05" },
    });

    expect(sentAuthorization(fetchMock.mock.calls[0][1])).toBe("Bearer stub-access-token");
  });

  it("sends no accident when the caller has none, and invents nothing", async () => {
    // The case is opened at verification, before the patient has been asked
    // about the crash. The service must send exactly what it was given: an
    // incident type, a location and a date filled in here would reach the
    // database as a crash record the patient never gave.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ existing: false, submissionId: "submission-123" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { startIntake } = await import("../intake");
    await startIntake({
      locale: "en",
      claimant: { firstName: "Reva", lastName: "Lin", mobile: "+15550100123" },
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(body.accident).toBeUndefined();
    expect(Object.keys(body)).not.toContain("accident");

    const sent = JSON.stringify(body);
    expect(sent).not.toContain("Unknown");
    expect(sent).not.toContain("other");
    expect(sent).not.toContain(new Date().toISOString().slice(0, 10));
  });

  it("sends the accident unchanged once the patient has given one", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ existing: false, submissionId: "submission-123" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { startIntake } = await import("../intake");
    await startIntake({
      locale: "en",
      claimant: { firstName: "Reva", lastName: "Lin", mobile: "+15550100123" },
      accident: { incidentType: "car", incidentLocation: "Austin, TX", incidentDate: "2026-09-19" },
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      accident?: { incidentType: string; incidentLocation: string; incidentDate?: string };
    };
    expect(body.accident).toEqual({
      incidentType: "car",
      incidentLocation: "Austin, TX",
      incidentDate: "2026-09-19",
    });
  });

  it("carries the session when asking for an upload URL", async () => {
    // The upload token is a capability scoped to one submission. The backend
    // will not mint one without knowing who is asking.
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ bucket: "submissions", storagePath: "s/accidentReport/x.pdf", token: "upload-token" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const { createDocumentUploadUrl } = await import("../intake");
    await createDocumentUploadUrl({
      submissionId: "eee0b2d0-2362-494c-a890-eb1e9931fe33",
      fileName: "x.pdf",
      category: "accidentReport",
    });

    expect(sentAuthorization(fetchMock.mock.calls[0][1])).toBe("Bearer stub-access-token");
  });

  it("carries the session when deleting an uploaded document", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    const { deleteDocument } = await import("../intake");
    await deleteDocument({
      submissionId: "eee0b2d0-2362-494c-a890-eb1e9931fe33",
      storagePath: "eee0b2d0-2362-494c-a890-eb1e9931fe33/accidentReport/haa-people-de6b2588.png",
    });

    expect(String(fetchMock.mock.calls[0][0])).toBe("http://localhost:4000/intake/documents/delete");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      submissionId: "eee0b2d0-2362-494c-a890-eb1e9931fe33",
      storagePath: "eee0b2d0-2362-494c-a890-eb1e9931fe33/accidentReport/haa-people-de6b2588.png",
    });
    expect(sentAuthorization(fetchMock.mock.calls[0][1])).toBe("Bearer stub-access-token");
  });

  it("sends the stored submission id when creating an agreement", async () => {
    // The id comes from sessionStorage, which the post-submit cleanup preserves.
    // It is navigation state only - authority is the bearer token, and the
    // backend re-resolves the patient from it before acting on the id.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "sent", signingUrl: "https://demo.docusign.net/signing/x" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { createAgreement } = await import("../intake");
    const result = await createAgreement("eee0b2d0-2362-494c-a890-eb1e9931fe33", "es");

    expect(String(fetchMock.mock.calls[0][0])).toBe("http://localhost:4000/intake/agreement");
    // The selected language travels with the request — it is what selects the
    // retainer — so a Spanish signing request must carry locale "es".
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      submissionId: "eee0b2d0-2362-494c-a890-eb1e9931fe33",
      locale: "es",
    });
    // The submission id alone proves nothing; the session travels with it.
    expect(sentAuthorization(fetchMock.mock.calls[0][1])).toBe("Bearer stub-access-token");
    expect(result).toEqual({ status: "sent", signingUrl: "https://demo.docusign.net/signing/x", ok: true });
  });

  it("reads agreement status for the stored submission id", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "completed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { getAgreementStatus } = await import("../intake");
    const result = await getAgreementStatus("eee0b2d0-2362-494c-a890-eb1e9931fe33");

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "http://localhost:4000/intake/agreement/eee0b2d0-2362-494c-a890-eb1e9931fe33"
    );
    expect(sentAuthorization(fetchMock.mock.calls[0][1])).toBe("Bearer stub-access-token");
    expect(result).toEqual({ ok: true, status: "completed" });
  });

  it("surfaces a refused agreement as a code rather than throwing", async () => {
    // The backend refuses on its own authority - a missing patient email here,
    // but equally an unsubmitted or unknown submission. The service must pass
    // the refusal through instead of masking it.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "patient_email_required" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { createAgreement } = await import("../intake");

    expect(await createAgreement("eee0b2d0-2362-494c-a890-eb1e9931fe33", "en")).toEqual({
      ok: false,
      code: "patient_email_required",
    });
  });
  it("sends only the phone and code when verifying an OTP", async () => {
    // Identity is the backend's to decide, so nothing that could nominate a
    // patient is offered — not a user id, a claimant, a submission or an email.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ accessToken: "a.b.c", refreshToken: "r", expiresIn: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { verifyOtp } = await import("../intake");
    const result = await verifyOtp("+15550100123", "111111");

    expect(String(fetchMock.mock.calls[0][0])).toBe("http://localhost:4000/intake/verify-otp");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      phone: "+15550100123",
      code: "111111",
    });
    expect(result).toEqual({ ok: true, accessToken: "a.b.c", refreshToken: "r" });
  });

  it("reports a rejected code rather than throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_code" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { verifyOtp } = await import("../intake");

    expect(await verifyOtp("+15550100123", "000000")).toEqual({ ok: false, code: "invalid_code" });
  });

  it("reports a malformed phone refusal from the backend", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_phone" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { verifyOtp } = await import("../intake");

    expect(await verifyOtp("not-a-phone", "111111")).toEqual({ ok: false, code: "invalid_phone" });
  });

  it("reports a backend outage as a failure, never as a session", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "session_unavailable" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { verifyOtp } = await import("../intake");
    const result = await verifyOtp("+15550100123", "111111");

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("accessToken");
  });

  it("refuses a verify response carrying anything beyond the session", async () => {
    // The contract is strict so a backend that started returning a patient
    // identifier would fail the parse rather than leak it into the browser.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ accessToken: "a.b.c", refreshToken: "r", expiresIn: 3600, userId: "leaked" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { verifyOtp } = await import("../intake");

    await expect(verifyOtp("+15550100123", "111111")).rejects.toThrow();
  });
});

// The review page's only source of case data. The token travels server to
// server; the service sends exactly the three fields, asks for no caching, and
// turns anything that is not a well-formed case into a refusal or an error —
// never into a partly rendered case.
describe("lawyer review case service", () => {
  const access = {
    claimantUserId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    submissionId: "9b2e7c41-5d6a-4f38-8e1b-2c7d9a0f3e55",
    token: "qH3kz1YtV0cP7mR2sB8nW4dL6fJ9xA5e",
  };
  const masked = {
    ok: true,
    access: "masked",
    review: { status: "pending", canDecide: true, responseDeadline: "2026-10-13T12:00:00.000Z" },
    caseFacts: {
      incidentType: "car",
      role: "driver",
      injuries: null,
      story: null,
      language: "en",
      companionRelations: [],
      documentCounts: [],
    },
    patient: null,
    incident: { date: "2025-11-17", location: "Lamar Blvd & W 38th St, Austin, TX" },
    companions: null,
    documents: [
      {
        id: "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d",
        category: "insuranceCard",
        fileName: null,
        mimeType: "application/pdf",
        fileSize: 2048,
        kind: "pdf",
        available: true,
      },
    ],
  };
  const answer = (status: number, body: unknown) =>
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("API_URL", "http://backend:4000");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("posts the ids and the token, uncached, and returns the case", async () => {
    const fetchMock = answer(200, masked);
    const { getLawyerReviewCase } = await import("../intake");

    const result = await getLawyerReviewCase({ ...access, extra: "not sent" } as typeof access);

    expect(result).toEqual({ ok: true, reviewCase: masked });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://backend:4000/portal/review-case");
    expect(init?.method).toBe("POST");
    expect(init?.cache).toBe("no-store");
    expect(JSON.parse(String(init?.body))).toEqual(access);
  });

  it("reports a link the backend refuses as denied", async () => {
    for (const status of [400, 401, 404]) {
      answer(status, { error: "invalid_token" });
      const { getLawyerReviewCase } = await import("../intake");
      expect(await getLawyerReviewCase(access)).toEqual({ ok: false, code: "denied" });
      vi.restoreAllMocks();
    }
  });

  it("reports a failure, an outage or a malformed answer as unavailable", async () => {
    const { getLawyerReviewCase } = await import("../intake");

    answer(500, { error: "case_load_failed" });
    expect(await getLawyerReviewCase(access)).toEqual({ ok: false, code: "unavailable" });
    vi.restoreAllMocks();

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connect ECONNREFUSED"));
    expect(await getLawyerReviewCase(access)).toEqual({ ok: false, code: "unavailable" });
    vi.restoreAllMocks();

    answer(200, { ...masked, patient: { firstName: "Marisol" } });
    expect(await getLawyerReviewCase(access)).toEqual({ ok: false, code: "unavailable" });
    vi.restoreAllMocks();

    // A pending file that arrives with its own name, as a patient often gives it.
    answer(200, { ...masked, documents: [{ ...masked.documents[0], fileName: "Marisol_Quintanilla_card.pdf" }] });
    expect(await getLawyerReviewCase(access)).toEqual({ ok: false, code: "unavailable" });
    vi.restoreAllMocks();

    answer(200, {
      ...masked,
      access: "full",
      patient: { firstName: null, lastName: null, mobile: null, email: null, residence: null, treatmentArea: null },
      incident: { date: null, location: null },
      companions: [],
      documents: [
        {
          id: "javascript:alert(1)",
          category: "insuranceCard",
          fileName: "card.pdf",
          mimeType: "application/pdf",
          fileSize: 1,
          kind: "pdf",
          available: true,
        },
      ],
    });
    expect(await getLawyerReviewCase(access)).toEqual({ ok: false, code: "unavailable" });
  });
});

// Case Summary: the patient's own case is read and saved as the patient, and a
// save that names email or phone never leaves the browser.
describe("case summary service", () => {
  const stored = {
    submissionId: "submission-123",
    status: "submitted",
    submittedAt: "2026-08-20T10:00:00Z",
    firstName: "John",
    lastName: "Doe",
    phone: "+15551234567",
    email: "john@example.test",
    incidentType: "car",
    incidentDate: "2026-08-19",
    incidentLocation: "New York, NY, USA",
    incidentLocationDetails: null,
    role: "driver",
    injuries: "back",
    treatmentArea: "New York, NY 10001",
    treatmentAreaLocationDetails: null,
    companions: [],
    documents: [],
    editable: true,
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("reads the case with the server's token, uncached", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(stored));
    const { getCaseSummary } = await import("../intake");

    expect(await getCaseSummary("submission-123", "server-side-token")).toEqual(stored);
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://localhost:4000/case/submission-123");
    expect(sentAuthorization(fetchMock.mock.calls[0][1])).toBe("Bearer server-side-token");
    expect(fetchMock.mock.calls[0][1]?.cache).toBe("no-store");
  });

  it("treats a refused read as not found", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: "Case not found" }, 404));
    const { getCaseSummary } = await import("../intake");

    await expect(getCaseSummary("someone-elses-case", "token")).rejects.toThrow("Case not found");
  });

  it("saves as the patient and returns the stored case", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ ...stored, injuries: "back,headNeck" }));
    const { saveCaseSummary } = await import("../intake");

    const result = await saveCaseSummary("submission-123", { injuries: "back,headNeck" });

    expect(result.injuries).toBe("back,headNeck");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:4000/case/submission-123");
    expect(init.method).toBe("POST");
    expect(sentAuthorization(init)).toBe("Bearer stub-access-token");
    expect(JSON.parse(String(init.body))).toEqual({ injuries: "back,headNeck" });
  });

  it("refuses to send email or phone, at any level, before any request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(stored));
    const { saveCaseSummary } = await import("../intake");

    const attempts = [
      { email: "attacker@example.test" },
      { phone: "+15550000000" },
      { claimant: { firstName: "John", lastName: "Doe", email: "attacker@example.test" } },
      { claimant: { firstName: "John", lastName: "Doe", mobile: "+15550000000" } },
      { injuries: "back", status: "signed" },
    ];
    for (const payload of attempts) {
      await expect(saveCaseSummary("submission-123", payload as never)).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports the backend's refusal code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: "case_locked" }, 409));
    const { saveCaseSummary, CaseSummarySaveError } = await import("../intake");

    const failure = await saveCaseSummary("submission-123", { injuries: "back" }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CaseSummarySaveError);
    expect((failure as InstanceType<typeof CaseSummarySaveError>).code).toBe("case_locked");
  });
});
