import { describe, expect, it } from "vitest";

import { resolveRequestOrigin } from "../request-origin";

function req(headers: Record<string, string>, url = "http://0.0.0.0:3000/access/submit") {
  return new Request(url, { headers });
}

describe("resolveRequestOrigin", () => {
  it("uses the forwarded host and protocol the proxy reports", () => {
    expect(resolveRequestOrigin(req({ "x-forwarded-host": "haaaaaaaa.com", "x-forwarded-proto": "https" }))).toBe(
      "https://haaaaaaaa.com"
    );
  });

  it("takes the first entry when proxies chain the forwarded host", () => {
    expect(
      resolveRequestOrigin(
        req({ "x-forwarded-host": "haaaaaaaa.com, internal.lb", "x-forwarded-proto": "https, http" })
      )
    ).toBe("https://haaaaaaaa.com");
  });

  it("falls back to the Host header when the request is not proxied", () => {
    expect(resolveRequestOrigin(req({ host: "localhost:3000" }))).toBe("http://localhost:3000");
  });

  it("never returns the server's own binding when a client host is known", () => {
    const origin = resolveRequestOrigin(req({ host: "haaaaaaaa.com" }));

    expect(origin).not.toContain("0.0.0.0");
  });

  it("falls back to the request URL when no host information exists at all", () => {
    expect(resolveRequestOrigin(new Request("https://example.test/access/submit"))).toBe("https://example.test");
  });
});
