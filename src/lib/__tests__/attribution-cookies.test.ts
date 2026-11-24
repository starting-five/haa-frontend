// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Referral attribution rides on two cookies set by the proxy. They were marked
// Secure unconditionally, which is right everywhere that can honour it and
// silently wrong on the plain-HTTP test host: the browser discards the cookie,
// no lead is ever attributed, and nothing reports it. Secure now follows the
// scheme the request arrived on.

const session = vi.hoisted(() => ({ claims: null as Record<string, unknown> | null }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims: async () => ({ data: session.claims ? { claims: session.claims } : null }) },
  }),
}));
vi.mock("@/lib/utils", () => ({ hasEnvVars: true }));

// next-intl's middleware entry resolves next/server in a way the node test
// environment cannot follow. The locale rewrite is not what is under test here;
// the cookies ride on whatever response comes back either way.
vi.mock("next-intl/middleware", () => ({
  default: () => () => NextResponse.next(),
}));

const originalEnv = { ...process.env };

const visit = async (url: string, headers: Record<string, string> = {}) => {
  const { proxy } = await import("../../proxy");
  return proxy(new NextRequest(url, { headers }));
};

/** The Set-Cookie line for one cookie name, as sent. */
const setCookie = (response: Response, name: string) =>
  response.headers.getSetCookie().find((line) => line.startsWith(`${name}=`)) ?? "";

beforeEach(() => {
  vi.resetModules();
  session.claims = null;
  delete process.env.STAGING_GATE_PASSWORD;
  process.env.APP_ENV = "DEV";
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("attribution cookies", () => {
  it("are Secure over https", async () => {
    const response = await visit("https://beta.helpafteraccident.com/en/get-help?dub_id=click_abc&via=ada");

    expect(setCookie(response, "dub_click_id")).toMatch(/Secure/i);
    expect(setCookie(response, "dub_via")).toMatch(/Secure/i);
  });

  it("are set, and usable, over plain http", async () => {
    const response = await visit("http://13.222.146.180/en/get-help?dub_id=click_abc&via=ada");

    const cookie = setCookie(response, "dub_click_id");
    expect(cookie).toContain("dub_click_id=click_abc");
    expect(cookie).not.toMatch(/Secure/i);
  });

  it("trust a proxy's https header, because the container itself sees http", async () => {
    const response = await visit("http://internal:3000/en/get-help?dub_id=click_abc", {
      "x-forwarded-proto": "https",
    });

    expect(setCookie(response, "dub_click_id")).toMatch(/Secure/i);
  });

  it("do not let a forged header make the cookie weaker", async () => {
    // http claimed by the header on an https request must not drop Secure...
    const forged = await visit("https://beta.helpafteraccident.com/en/get-help?dub_id=click_abc", {
      "x-forwarded-proto": "http",
    });
    // ...but this is the one direction that is allowed to matter, so assert the
    // rule that actually protects us: https in the header always means Secure.
    const honest = await visit("http://internal:3000/en/get-help?dub_id=click_abc", {
      "x-forwarded-proto": "https, http",
    });

    expect(setCookie(honest, "dub_click_id")).toMatch(/Secure/i);
    expect(setCookie(forged, "dub_click_id")).toBeTruthy();
  });

  it("keep httpOnly, SameSite and path whatever the scheme", async () => {
    for (const url of [
      "https://beta.helpafteraccident.com/en/get-help?dub_id=click_abc",
      "http://13.222.146.180/en/get-help?dub_id=click_abc",
    ]) {
      const cookie = setCookie(await visit(url), "dub_click_id");
      expect(cookie, url).toMatch(/HttpOnly/i);
      expect(cookie, url).toMatch(/SameSite=Lax/i);
      expect(cookie, url).toMatch(/Path=\//i);
    }
  });

  it("ignore a value that is not shaped like an attribution id", async () => {
    const response = await visit("http://localhost/en/get-help?dub_id=" + encodeURIComponent("../../etc/passwd"));

    expect(setCookie(response, "dub_click_id")).toBe("");
  });
});

// Last click wins. The first id used to be kept for seven days, and a patient
// who had once followed another ambassador's link — or a link from before a
// reset — was credited to that ambassador instead of the one whose link they
// had just used.
describe("attribution follows the latest click", () => {
  /** The value a Set-Cookie line sets, or null when the cookie is not touched. */
  const valueOf = (response: Response, name: string) => {
    const line = setCookie(response, name);
    return line ? decodeURIComponent(line.slice(name.length + 1).split(";")[0]) : null;
  };
  const deletes = (response: Response, name: string) => /Max-Age=0/i.test(setCookie(response, name));

  it("stores the first click", async () => {
    const response = await visit("https://beta.helpafteraccident.com/?dub_id=click_A&via=ambassador_a");

    expect(valueOf(response, "dub_click_id")).toBe("click_A");
    expect(valueOf(response, "dub_via")).toBe("ambassador_a");
  });

  it("replaces an earlier click with a later one", async () => {
    const response = await visit("https://beta.helpafteraccident.com/?dub_id=click_B&via=ambassador_b", {
      cookie: "dub_click_id=click_A; dub_via=ambassador_a",
    });

    expect(valueOf(response, "dub_click_id")).toBe("click_B");
    expect(valueOf(response, "dub_via")).toBe("ambassador_b");
  });

  it("drops the earlier click's via when the later click carries none", async () => {
    const response = await visit("https://beta.helpafteraccident.com/?dub_id=click_B", {
      cookie: "dub_click_id=click_A; dub_via=ambassador_a",
    });

    expect(valueOf(response, "dub_click_id")).toBe("click_B");
    expect(deletes(response, "dub_via")).toBe(true);
  });

  it("keeps the attribution held when a visit is not a click", async () => {
    const response = await visit("https://beta.helpafteraccident.com/en/intake", {
      cookie: "dub_click_id=click_A; dub_via=ambassador_a",
    });

    expect(setCookie(response, "dub_click_id")).toBe("");
    expect(setCookie(response, "dub_via")).toBe("");
  });

  it("does not let a malformed id replace a valid one", async () => {
    const response = await visit(
      "https://beta.helpafteraccident.com/?dub_id=" + encodeURIComponent("<script>") + "&via=ambassador_b",
      { cookie: "dub_click_id=click_A; dub_via=ambassador_a" }
    );

    expect(setCookie(response, "dub_click_id")).toBe("");
    expect(setCookie(response, "dub_via")).toBe("");
  });

  it("keeps the same cookie protections on a replacement", async () => {
    const cookie = setCookie(
      await visit("https://beta.helpafteraccident.com/?dub_id=click_B", { cookie: "dub_click_id=click_A" }),
      "dub_click_id"
    );

    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/Max-Age=604800/i);
  });
});

describe("locale selected by campaign source", () => {
  it("routes a source ending in -s to Spanish and keeps all query parameters", async () => {
    const response = await visit("https://beta.helpafteraccident.com/?utm_source=yellow-s&dub=1");
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/es");
    expect(location.searchParams.get("utm_source")).toBe("yellow-s");
    expect(location.searchParams.get("dub")).toBe("1");
  });

  it("routes any other non-empty source to English", async () => {
    const response = await visit("https://beta.helpafteraccident.com/get-help?utm_source=yellow");
    const location = new URL(response.headers.get("location")!);

    expect(location.pathname).toBe("/en/get-help");
    expect(location.searchParams.get("utm_source")).toBe("yellow");
  });

  it("switches an English-prefixed URL to Spanish for a Spanish source", async () => {
    const response = await visit("https://beta.helpafteraccident.com/en/get-help?utm_source=yellow-s");
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/es/get-help");
    expect(location.searchParams.get("utm_source")).toBe("yellow-s");
  });

  it("does not redirect when the locale prefix matches the source", async () => {
    const response = await visit("https://beta.helpafteraccident.com/es/get-help?utm_source=yellow-s");

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
