// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Authenticated patients are still kept off acquisition entry points, but
// intake resume routes stay reachable so an unfinished intake can continue.

const session = vi.hoisted(() => ({
  claims: null as Record<string, unknown> | null,
  ambassadorUserIds: new Set<string>(),
  ambassadorLookups: 0,
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims: async () => ({ data: session.claims ? { claims: session.claims } : null }) },
    from: () => ({
      select: () => ({
        eq: (_column: string, value: string) => ({
          maybeSingle: async () => {
            session.ambassadorLookups += 1;
            return { data: session.ambassadorUserIds.has(value) ? { user_id: value } : null, error: null };
          },
        }),
      }),
    }),
  }),
}));
vi.mock("../utils", () => ({ hasEnvVars: true }));

import { updateSession } from "../supabase/proxy";

const visit = (pathname: string) => updateSession(new NextRequest(`http://localhost${pathname}`));

describe("patient entry route guard", () => {
  beforeEach(() => {
    session.claims = null;
    session.ambassadorUserIds.clear();
  });

  it("sends a signed-in visitor on the flow's entry to the dashboard", async () => {
    session.claims = { sub: "patient-without-a-case" };

    const response = await visit("/en/get-help");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/en/intake/dashboard");
  });

  it("serves the entry once that session has ended", async () => {
    const response = await visit("/es/get-help");

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("still keeps a signed-out visitor away from the dashboard", async () => {
    const response = await visit("/en/intake/dashboard");

    expect(response.headers.get("location")).toBe("http://localhost/en/patient/login");
  });

  // The attorney and agreement screens belong to a signed-in patient, the
  // matched attorney that leads to them included.
  for (const route of ["choose-attorney", "hire-attorney", "agreement"]) {
    it(`keeps a signed-out visitor away from /es/intake/${route}`, async () => {
      const response = await visit(`/es/intake/${route}`);

      expect(response.headers.get("location")).toBe("http://localhost/es/patient/login");
    });
  }
});

// The reorder moved the accident screens behind the code screen, and the
// Verified interstitial now sits at the front of them. A patient is signed in
// by the time they reach any of these, so the entry-route rule must not treat
// them as entry routes any more — it bounced every verified patient to the
// dashboard before this was fixed.
describe("the screens that follow verification", () => {
  beforeEach(() => {
    session.claims = { sub: "patient-mid-intake" };
    session.ambassadorUserIds.clear();
  });

  for (const route of ["verified", "incident", "fault", "date", "confirm-date", "location"]) {
    it(`serves /en/intake/${route} to a patient who has just verified`, async () => {
      const response = await visit(`/en/intake/${route}`);

      expect(response.headers.get("location")).toBeNull();
      expect(response.status).toBe(200);
    });
  }

  for (const route of ["intake", "intake/phone", "intake/otp"]) {
    it(`serves /en/${route} so a signed-in patient can resume onboarding`, async () => {
      const response = await visit(`/en/${route}`);

      expect(response.headers.get("location")).toBeNull();
      expect(response.status).toBe(200);
    });
  }

  for (const route of ["get-help", "intake/splash", "intake/help-is-on-the-way"]) {
    it(`still turns a signed-in visitor away from /en/${route}`, async () => {
      const response = await visit(`/en/${route}`);

      expect(response.headers.get("location")).toBe("http://localhost/en/intake/dashboard");
    });
  }
});

describe("ambassador route guard", () => {
  beforeEach(() => {
    session.claims = null;
    session.ambassadorUserIds.clear();
    session.ambassadorLookups = 0;
  });

  it("sends a signed-out visitor from the ambassador dashboard to ambassador login", async () => {
    const response = await visit("/en/ambassadors/dashboard");

    expect(response.headers.get("location")).toBe("http://localhost/en/ambassadors/login");
  });

  for (const route of [
    "ambassadors",
    "ambassadors/language-selector",
    "ambassadors/get-started",
    "ambassadors/onboarding",
    "ambassadors/onboarding/name",
    "ambassadors/login",
  ]) {
    it(`sends a signed-in ambassador from /en/${route} to the ambassador dashboard`, async () => {
      session.claims = { sub: "ambassador-1" };
      session.ambassadorUserIds.add("ambassador-1");

      const response = await visit(`/en/${route}`);

      expect(response.headers.get("location")).toBe("http://localhost/en/ambassadors/dashboard");
    });
  }

  it("serves the ambassador dashboard to a signed-in ambassador", async () => {
    session.claims = { sub: "ambassador-1" };
    session.ambassadorUserIds.add("ambassador-1");

    const response = await visit("/es/ambassadors/dashboard");

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("keeps a signed-in non-ambassador out of the ambassador dashboard", async () => {
    session.claims = { sub: "patient-1" };

    const response = await visit("/en/ambassadors/dashboard");

    expect(response.headers.get("location")).toBe("http://localhost/en/ambassadors/login");
  });

  it("serves /en/intake to a signed-in non-ambassador so they can resume intake", async () => {
    session.claims = { sub: "patient-1" };

    const response = await visit("/en/intake");

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });
});

// One phone number can be both a patient and an ambassador: one Supabase user
// holding a claimant and an ambassador profile. The route is the flow, so having
// an ambassador profile must never take someone out of the patient flow — that
// is what sent a patient who had just submitted to the ambassador dashboard.
describe("the same account as patient and ambassador", () => {
  beforeEach(() => {
    session.claims = { sub: "both-roles" };
    session.ambassadorUserIds.clear();
    session.ambassadorUserIds.add("both-roles");
    session.ambassadorLookups = 0;
  });

  for (const route of [
    "intake/dashboard",
    "intake/dashboard/attorney",
    "intake/ready",
    "intake/choose-attorney",
    "intake/hire-attorney",
    "intake/agreement",
    "intake/connected",
    "intake/verified",
    "intake/incident",
    "patient/login",
    "case/9b2e7c41-5d6a-4f38-8e1b-2c7d9a0f3e55",
  ]) {
    it(`serves /en/${route} as the patient's, without asking about the ambassador profile`, async () => {
      const response = await visit(`/en/${route}`);

      expect(response.headers.get("location")).toBeNull();
      expect(response.status).toBe(200);
      expect(session.ambassadorLookups).toBe(0);
    });
  }

  for (const route of ["get-help", "intake/splash", "intake/help-is-on-the-way"]) {
    it(`sends /en/${route} on to the patient dashboard, as for any signed-in patient`, async () => {
      const response = await visit(`/en/${route}`);

      expect(response.headers.get("location")).toBe("http://localhost/en/intake/dashboard");
      expect(session.ambassadorLookups).toBe(0);
    });
  }

  it("serves the patient landing at the locale root rather than the ambassador dashboard", async () => {
    const response = await visit("/es");

    expect(response.headers.get("location")).toBeNull();
    expect(session.ambassadorLookups).toBe(0);
  });

  it("still goes to the ambassador dashboard from the ambassador flow", async () => {
    for (const route of ["ambassadors", "ambassadors/login", "ambassadors/get-started"]) {
      const response = await visit(`/en/${route}`);
      expect(response.headers.get("location")).toBe("http://localhost/en/ambassadors/dashboard");
    }
    const dashboard = await visit("/en/ambassadors/dashboard");
    expect(dashboard.headers.get("location")).toBeNull();
  });

  it("lets the ambassador's onboarding continue", async () => {
    const response = await visit("/en/ambassadors/onboarding/share-it");

    expect(response.headers.get("location")).toBeNull();
  });
});

// A patient arriving through an ambassador's referral link is in the patient
// flow: the link is attribution, not a role.
describe("a patient who came through an ambassador's link", () => {
  it("is served the patient flow, whatever the query string carries", async () => {
    session.claims = null;
    session.ambassadorUserIds.clear();
    session.ambassadorLookups = 0;

    for (const path of ["/en/get-help?via=ada&dub_id=abc", "/en?via=ada", "/en/intake?ref=ambassador"]) {
      const response = await visit(path);
      expect(response.headers.get("location")).toBeNull();
    }
    expect(session.ambassadorLookups).toBe(0);
  });
});
