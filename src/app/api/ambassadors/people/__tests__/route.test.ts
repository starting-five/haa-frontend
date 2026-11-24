import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The security boundary for People Helped.
//
// Which patients belong to which ambassador is an authorization question, and
// it is answered by the backend's GET /ambassadors/people. This route holds no
// patient-data logic and reaches no database: its whole job is to carry the
// caller's own session token there and shape what comes back.
//
// What these tests exist to prevent is the route acquiring a second source of
// patient records — a direct Supabase read, or the portal's all-patients
// endpoint — so they assert not only the empty responses but that nothing
// other than the scoped backend call is ever made.

const OWN_SUBMISSION = "11111111-1111-4111-8111-111111111111";

const auth = vi.hoisted(() => ({
  session: { access_token: "ambassador-token" } as { access_token: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getSession: async () => ({ data: { session: auth.session } }) },
  }),
}));

const originalEnv = { ...process.env };
const fetchMock = vi.fn();

const call = async (url = "http://localhost/api/ambassadors/people") => {
  const { GET } = await import("../route");
  const response = await GET(new Request(url));
  return {
    response,
    body: (await response.json()) as { people: { id: string }[]; truncated?: boolean; debug?: { reason?: string } },
  };
};

const requestedUrls = () => fetchMock.mock.calls.map((args) => String(args[0]));

const backendReturns = (people: unknown[], truncated = false) => ({
  ok: true,
  status: 200,
  json: async () => ({ people, truncated }),
});

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.API_URL = "http://backend:4000";
  process.env.APP_ENV = "DEV";
  auth.session = { access_token: "ambassador-token" };
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("GET /api/ambassadors/people", () => {
  it("returns what the backend scoped, carrying the caller's own token", async () => {
    fetchMock.mockResolvedValueOnce(
      backendReturns([
        {
          submissionId: OWN_SUBMISSION,
          name: "Ada Okafor",
          incidentType: "car",
          incidentDate: "2026-09-19",
          location: "Austin, TX",
          phone: "+15550000001",
          email: "ada@example.com",
          status: "submitted",
          referredAt: "2026-09-20T10:00:00Z",
        },
      ])
    );

    const { body } = await call();

    expect(body.people).toHaveLength(1);
    expect(body.people[0]).toMatchObject({
      id: OWN_SUBMISSION,
      name: "Ada Okafor",
      incident: "Car",
      statusKey: "statusSubmitted",
    });
    expect(requestedUrls()).toEqual(["http://backend:4000/ambassadors/people"]);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer ambassador-token",
    });
  });

  it("asks the backend for nothing when there is no session", async () => {
    auth.session = null;

    const { body } = await call("http://localhost/api/ambassadors/people?debug=1");

    expect(body.people).toEqual([]);
    expect(body.debug?.reason).toBe("no_session");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns none when the backend refuses", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });

    const { body } = await call("http://localhost/api/ambassadors/people?debug=1");

    expect(body.people).toEqual([]);
    expect(body.debug?.reason).toBe("backend_error");
  });

  it("returns none when the backend is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    const { body } = await call("http://localhost/api/ambassadors/people?debug=1");

    expect(body.people).toEqual([]);
    expect(body.debug?.reason).toBe("backend_unreachable");
  });

  it("returns none for a malformed backend body rather than guessing", async () => {
    for (const payload of [null, { people: "not-an-array" }, { people: [{}] }, { people: [{ name: "No id" }] }]) {
      vi.resetModules();
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => payload });
      const { body } = await call();
      expect(body.people).toEqual([]);
    }
  });

  it("carries the provider's truncation flag through", async () => {
    fetchMock.mockResolvedValueOnce(
      backendReturns([{ submissionId: OWN_SUBMISSION, name: "Ada", status: "intake" }], true)
    );

    const { body } = await call();

    expect(body.truncated).toBe(true);
  });

  it("maps every status the backend can send, old and new", async () => {
    const cases: Array<[string, string]> = [
      ["in_progress", "statusIntake"],
      ["intake", "statusIntake"],
      ["submitted", "statusSubmitted"],
      ["retainer_pending_signature", "statusAwaitingSignature"],
      ["attorney", "statusAttorney"],
      ["doctor", "statusDoctor"],
      ["signed", "statusSigned"],
      ["treating", "statusTreating"],
      ["qualified", "statusQualified"],
      ["not_qualified", "statusNotQualified"],
      ["something-unexpected", "statusIntake"],
      ["  SIGNED  ", "statusSigned"],
    ];

    for (const [status, expected] of cases) {
      vi.resetModules();
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(backendReturns([{ submissionId: OWN_SUBMISSION, name: "Ada", status }]));
      const { body } = await call();
      expect(body.people[0], status).toMatchObject({ statusKey: expected });
    }
  });
});

// A retainer the admin sent and the patient has not signed is not Signed. Only
// the backend's 'signed', set once DocuSign reports the envelope completed, is.
describe("retainer status on People Helped", () => {
  const statusOf = async (status: string) => {
    vi.resetModules();
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(backendReturns([{ submissionId: OWN_SUBMISSION, name: "Ada", status }]));
    const { body } = await call();
    return (body.people[0] as unknown as { statusKey: string }).statusKey;
  };

  it("never reads retainer_pending_signature as Signed", async () => {
    expect(await statusOf("retainer_pending_signature")).toBe("statusAwaitingSignature");
    expect(await statusOf("retainer_pending_signature")).not.toBe("statusSigned");
  });

  it("reads only the backend's exact 'signed' as Signed", async () => {
    expect(await statusOf("signed")).toBe("statusSigned");
    for (const lookalike of ["unsigned", "signing", "sign", "retainer_signed_pending", "designated"]) {
      expect(await statusOf(lookalike), lookalike).not.toBe("statusSigned");
    }
  });

  it("does not guess qualified from a lookalike either", async () => {
    for (const lookalike of ["disqualified", "qualified_pending", "requalify"]) {
      expect(await statusOf(lookalike), lookalike).not.toBe("statusQualified");
      expect(await statusOf(lookalike), lookalike).not.toBe("statusNotQualified");
    }
    expect(await statusOf("not_qualified")).toBe("statusNotQualified");
  });

  it("follows the case as it moves on: awaiting signature, then signed", async () => {
    const lifecycle: Array<[string, string]> = [
      ["intake", "statusIntake"],
      ["submitted", "statusSubmitted"],
      ["retainer_pending_signature", "statusAwaitingSignature"],
      ["signed", "statusSigned"],
      ["attorney", "statusAttorney"],
      ["qualified", "statusQualified"],
    ];
    for (const [status, key] of lifecycle) expect(await statusOf(status), status).toBe(key);
  });
});

describe("the route has no patient-data source of its own", () => {
  it("never calls the portal's all-patients endpoint, on any path", async () => {
    const paths: Array<() => void> = [
      () => fetchMock.mockResolvedValueOnce(backendReturns([{ submissionId: OWN_SUBMISSION, name: "A", status: "x" }])),
      () => fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) }),
      () => fetchMock.mockRejectedValueOnce(new Error("down")),
      () => (auth.session = null),
    ];

    for (const setup of paths) {
      vi.resetModules();
      fetchMock.mockReset();
      auth.session = { access_token: "ambassador-token" };
      setup();
      await call();
      expect(requestedUrls().some((url) => url.includes("/portal/submissions"))).toBe(false);
      expect(requestedUrls().some((url) => url.includes("api.dub.co"))).toBe(false);
    }
  });

  it("the module holds no Supabase table access and no service-role key", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("src/app/api/ambassadors/people/route.ts", "utf8")
    );

    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain("@supabase/supabase-js");
    expect(source).not.toContain('from("claimants")');
    expect(source).not.toContain('from("accidents")');
    expect(source).not.toContain('from("intake_submissions")');
    expect(source).not.toContain("/portal/submissions");
    expect(source).not.toContain("api.dub.co");
  });

  it("no frontend route anywhere reads a patient table with the service-role key", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const path = await import("node:path");

    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === "__tests__" ? [] : walk(full);
        return entry.name.endsWith(".ts") ? [full] : [];
      });

    const offenders = walk("src/app/api").filter((file) => {
      const source = readFileSync(file, "utf8");
      const usesServiceRole = source.includes("SUPABASE_SERVICE_ROLE_KEY");
      const readsPatientTable = /from\("(claimants|accidents|intake_submissions|documents)"\)/.test(source);
      return usesServiceRole && readsPatientTable;
    });

    expect(offenders).toEqual([]);
  });
});
