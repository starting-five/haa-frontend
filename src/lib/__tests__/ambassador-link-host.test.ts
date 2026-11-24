import { afterEach, describe, expect, it, vi } from "vitest";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants";
import { resolveAmbassadorLinkHost } from "@/lib/ambassador-link-host";

// The ambassador link host is build configuration. These pin that a missing or
// malformed value is refused with the variable named, and that next.config.ts
// refuses the build itself — the failure the HP#129 image hid until a patient
// or ambassador opened the screen.

describe("resolveAmbassadorLinkHost", () => {
  it("is the bare host, whatever scheme or trailing slash it was written with", () => {
    expect(resolveAmbassadorLinkHost("go.helpafteraccident.com")).toBe("go.helpafteraccident.com");
    expect(resolveAmbassadorLinkHost(" https://go.helpafteraccident.com/ ")).toBe("go.helpafteraccident.com");
    expect(resolveAmbassadorLinkHost("http://localhost:3000")).toBe("localhost:3000");
  });

  it("refuses a missing value, naming the variable", () => {
    for (const value of [undefined, "", "   "]) {
      expect(() => resolveAmbassadorLinkHost(value)).toThrow(/NEXT_PUBLIC_AMBASSADOR_LINK_HOST/);
    }
  });

  it("refuses anything that is not a bare host", () => {
    for (const value of [
      "go.helpafteraccident.com/jess",
      "go helpafteraccident.com",
      "go.helpafteraccident.com?x=1",
      "-bad.com",
    ]) {
      expect(() => resolveAmbassadorLinkHost(value)).toThrow(/must be a bare host/);
    }
  });
});

describe("next.config.ts", () => {
  afterEach(() => vi.unstubAllEnvs());

  const loadConfig = async () => (await import("../../../next.config")).default;

  it("refuses a production build without the host, naming it", async () => {
    vi.stubEnv("NEXT_PUBLIC_AMBASSADOR_LINK_HOST", "");
    const config = await loadConfig();
    expect(() => config(PHASE_PRODUCTION_BUILD)).toThrow(/Missing required env var NEXT_PUBLIC_AMBASSADOR_LINK_HOST/);
    expect(() => config(PHASE_DEVELOPMENT_SERVER)).toThrow(/NEXT_PUBLIC_AMBASSADOR_LINK_HOST/);
  });

  it("builds with it", async () => {
    vi.stubEnv("NEXT_PUBLIC_AMBASSADOR_LINK_HOST", "go.helpafteraccident.com");
    const config = await loadConfig();
    expect(config(PHASE_PRODUCTION_BUILD)).toMatchObject({ output: "standalone" });
  });

  it("does not check next start, which serves a bundle that already carries the value", async () => {
    vi.stubEnv("NEXT_PUBLIC_AMBASSADOR_LINK_HOST", "");
    const config = await loadConfig();
    expect(() => config(PHASE_PRODUCTION_SERVER)).not.toThrow();
  });
});
