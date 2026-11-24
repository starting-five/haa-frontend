import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { debugAllowedHere, isDebugEnabled } from "../debug";

// The ambassador routes grew a debug mode any authenticated caller could turn
// on from the address bar. It returned the caller's stored profile, the
// resolved referral identity, which environment variables were set, and the
// referral provider's own error bodies relayed verbatim. A query parameter is
// not an access control; the deployment decides.

const originalEnv = { ...process.env };
const withDebug = (url = "http://localhost/api/ambassadors/people?debug=1") => new Request(url);

beforeEach(() => {
  delete process.env.APP_ENV;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("debug output is decided by the deployment, not the caller", () => {
  it("stays off in production however the caller asks", () => {
    for (const appEnv of ["PROD", "PRODUCTION", "prod", "BETA", "STAGING"]) {
      process.env.APP_ENV = appEnv;
      expect(isDebugEnabled(withDebug()), appEnv).toBe(false);
      expect(debugAllowedHere(), appEnv).toBe(false);
    }
  });

  it("stays off in production for every spelling of the parameter", () => {
    process.env.APP_ENV = "PROD";
    for (const query of ["debug=1", "debug=true", "DEBUG=1", "debug=1&debug=1", "x=1&debug=1"]) {
      expect(isDebugEnabled(withDebug(`http://localhost/api/ambassadors/people?${query}`)), query).toBe(false);
    }
  });

  it("is available to developers", () => {
    for (const appEnv of ["DEV", "dev", "development", "TEST"]) {
      process.env.APP_ENV = appEnv;
      expect(isDebugEnabled(withDebug()), appEnv).toBe(true);
    }
  });

  it("defaults to a developer environment when nothing is configured", () => {
    // A missing APP_ENV is a local checkout; deployments set it.
    expect(isDebugEnabled(withDebug())).toBe(true);
  });

  it("is off in a developer environment unless it is actually asked for", () => {
    process.env.APP_ENV = "DEV";
    expect(isDebugEnabled(new Request("http://localhost/api/ambassadors/people"))).toBe(false);
    expect(isDebugEnabled(new Request("http://localhost/api/ambassadors/people?debug=0"))).toBe(false);
  });
});
