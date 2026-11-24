import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Lead attribution decides which ambassador a patient is counted under, and
// that attribution is the only thing scoping the People Helped list. A
// submission id taken on trust would let any authenticated caller attach a
// stranger's case to their own link and pull that patient's record into their
// list, so ownership is proved against the backend before anything is sent to
// Dub. GET /case/:submissionId answers 404 for a case belonging to someone
// else; anything but 200 means "not yours".

const OWN_SUBMISSION = "11111111-1111-4111-8111-111111111111";
const STRANGER_SUBMISSION = "22222222-2222-4222-8222-222222222222";

const auth = vi.hoisted(() => ({
  user: { id: "patient-user" } as { id: string } | null,
  session: { access_token: "patient-token" } as { access_token: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: auth.user } }),
      getSession: async () => ({ data: { session: auth.session } }),
    },
  }),
}));

const originalEnv = { ...process.env };
const fetchMock = vi.fn();

const post = async (submissionId: string, cookie = "dub_click_id=click_abc") => {
  const { POST } = await import("../route");
  const response = await POST(
    new Request("http://localhost/api/intake/dub-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ submissionId, locale: "en", claimant: { firstName: "Ada", lastName: "Okafor" } }),
    })
  );
  return { response, body: (await response.json()) as { tracked?: boolean; reason?: string; error?: string } };
};

const trackedCall = () => fetchMock.mock.calls.find((args) => String(args[0]).includes("/track/lead"));

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.DUB_API_KEY = "dub-key";
  process.env.API_URL = "http://backend:4000";
  auth.user = { id: "patient-user" };
  auth.session = { access_token: "patient-token" };
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("POST /api/intake/dub-lead — submission ownership", () => {
  it("tracks a submission the caller owns", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ submissionId: OWN_SUBMISSION }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}), text: async () => "" });

    const { body } = await post(OWN_SUBMISSION);

    expect(body.tracked).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`http://backend:4000/case/${OWN_SUBMISSION}`);
    expect(trackedCall()).toBeDefined();
  });

  it("refuses a submission belonging to someone else, and sends nothing to Dub", async () => {
    // The backend answers 404 for a case the caller does not own.
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: "Case not found" }) });

    const { response, body } = await post(STRANGER_SUBMISSION);

    expect(response.status).toBe(200);
    expect(body.tracked).toBe(false);
    expect(body.reason).toBe("submission_not_owned");
    expect(trackedCall()).toBeUndefined();
  });

  it("fails closed when the ownership check cannot be reached", async () => {
    fetchMock.mockRejectedValueOnce(new Error("backend unreachable"));

    const { body } = await post(OWN_SUBMISSION);

    expect(body.tracked).toBe(false);
    expect(body.reason).toBe("submission_not_owned");
    expect(trackedCall()).toBeUndefined();
  });

  it("fails closed when the ownership check errors", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });

    const { body } = await post(OWN_SUBMISSION);

    expect(body.tracked).toBe(false);
    expect(trackedCall()).toBeUndefined();
  });

  it("refuses an unauthenticated caller before anything else", async () => {
    auth.user = null;
    auth.session = null;

    const { response, body } = await post(OWN_SUBMISSION);

    expect(response.status).toBe(401);
    expect(body.error).toBe("unauthorized");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing at all when Dub is not configured", async () => {
    delete process.env.DUB_API_KEY;

    const { body } = await post(OWN_SUBMISSION);

    expect(body.tracked).toBe(false);
    expect(body.reason).toBe("dub_not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not track without an attribution cookie, even for an owned submission", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

    const { body } = await post(OWN_SUBMISSION, "");

    expect(body.tracked).toBe(false);
    expect(body.reason).toBe("missing_dub_click_id");
    expect(trackedCall()).toBeUndefined();
  });
});

// A click id Dub never recorded — a bot visit, an id from another workspace, a
// link from before a reset — is answered 404 "Click event not found" and always
// will be. The cookie holding it used to survive the failure for seven days, so
// every later intake in that browser failed the same way.
describe("POST /api/intake/dub-lead — stale click ids", () => {
  const owned = () => ({ ok: true, status: 200, json: async () => ({}) });
  const dubAnswers = (status: number, code: string) => ({
    ok: false,
    status,
    json: async () => ({ error: { code, message: "Click event not found for clickId: click_stale" } }),
  });
  const cleared = (response: Response, name: string) =>
    response.headers.getSetCookie().some((line) => line.startsWith(`${name}=`) && /Max-Age=0/i.test(line));
  // the most recent call to Dub's lead endpoint
  const sentClickId = () => {
    const calls = fetchMock.mock.calls.filter((args) => String(args[0]).includes("/track/lead"));
    return JSON.parse(String((calls[calls.length - 1][1] as RequestInit).body)).clickId as string;
  };

  it("tracks the click the browser holds now", async () => {
    fetchMock.mockResolvedValueOnce(owned()).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

    const { body } = await post(OWN_SUBMISSION, "dub_click_id=click_latest; dub_via=ambassador_b");

    expect(body.tracked).toBe(true);
    expect(sentClickId()).toBe("click_latest");
  });

  it("clears the attribution when Dub has no record of the click", async () => {
    fetchMock.mockResolvedValueOnce(owned()).mockResolvedValueOnce(dubAnswers(404, "not_found"));

    const { response, body } = await post(OWN_SUBMISSION, "dub_click_id=click_stale; dub_via=ambassador_a");

    expect(body.tracked).toBe(false);
    expect(body.reason).toBe("dub_click_not_found");
    expect(cleared(response, "dub_click_id")).toBe(true);
    expect(cleared(response, "dub_via")).toBe(true);
  });

  it("keeps the attribution when the failure may pass", async () => {
    fetchMock.mockResolvedValueOnce(owned()).mockResolvedValueOnce(dubAnswers(429, "rate_limit_exceeded"));

    const { response, body } = await post(OWN_SUBMISSION, "dub_click_id=click_ok");

    expect(body.reason).toBe("dub_track_failed");
    expect(response.headers.getSetCookie().some((line) => line.startsWith("dub_click_id="))).toBe(false);
  });

  it("tracks a new valid click once the stale one is gone", async () => {
    fetchMock.mockResolvedValueOnce(owned()).mockResolvedValueOnce(dubAnswers(404, "not_found"));
    const first = await post(OWN_SUBMISSION, "dub_click_id=click_stale");
    expect(cleared(first.response, "dub_click_id")).toBe(true);

    // the browser followed a real link since: the proxy set the new id
    fetchMock.mockResolvedValueOnce(owned()).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    const second = await post(OWN_SUBMISSION, "dub_click_id=click_fresh");

    expect(second.body.tracked).toBe(true);
    expect(sentClickId()).toBe("click_fresh");
  });

  it("never writes the click id into the logs", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(owned()).mockResolvedValueOnce(dubAnswers(404, "not_found"));

    await post(OWN_SUBMISSION, "dub_click_id=click_stale");

    expect(JSON.stringify(logged.mock.calls)).not.toContain("click_stale");
    expect(JSON.stringify(logged.mock.calls)).toContain("not_found");
    logged.mockRestore();
  });
});
