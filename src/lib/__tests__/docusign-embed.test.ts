import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startEmbeddedSigning, type SessionEndEvent } from "@/lib/docusign-embed";

// The embedding module is the one place the application talks to DocuSign's
// browser library. These pin what it hands the library, that it loads the
// library from DocuSign's own hosts only, and that the mounted frame is given
// the screen rather than the library's 400px floor.

const mount = vi.fn();
const destroy = vi.fn();
const handlers: Record<string, (event?: SessionEndEvent) => void> = {};
const signing = vi.fn(() => ({
  on: (event: string, handler: (event?: SessionEndEvent) => void) => {
    handlers[event] = handler;
  },
  mount: (container: string | HTMLElement) => {
    mount(container);
    const frame = document.createElement("iframe");
    frame.style.minHeight = "400px";
    if (typeof container !== "string") container.appendChild(frame);
  },
  destroy,
}));
const loadDocuSign = vi.fn(async () => ({ signing }));
// The stub speaks the library's shape closely enough for the module; the cast keeps vitest's mock helpers.
const libraryOnPage = { loadDocuSign: loadDocuSign as unknown as NonNullable<Window["DocuSign"]>["loadDocuSign"] };

const baseOptions = () => ({
  scriptUrl: "https://js-d.docusign.com/bundle.js",
  integrationKey: "integration-key-under-test",
  signingUrl: "https://demo.docusign.net/Signing/MTRedeem/v1/abc",
  container: Object.assign(document.createElement("div"), { style: "height: 700px" }),
  onReady: vi.fn(),
  onSessionEnd: vi.fn(),
});

describe("startEmbeddedSigning", () => {
  beforeEach(() => {
    mount.mockClear();
    destroy.mockClear();
    signing.mockClear();
    loadDocuSign.mockClear();
    // The library is already on the page, so no script is fetched.
    window.DocuSign = libraryOnPage;
  });

  afterEach(() => {
    delete window.DocuSign;
    vi.restoreAllMocks();
  });

  it("mounts the default-view session with the signing URL and the integration key", async () => {
    const options = baseOptions();
    document.body.appendChild(options.container);

    const handle = await startEmbeddedSigning(options);

    expect(loadDocuSign).toHaveBeenCalledWith("integration-key-under-test");
    expect(signing).toHaveBeenCalledWith(
      expect.objectContaining({ url: options.signingUrl, displayFormat: "default" })
    );
    expect(mount).toHaveBeenCalledWith(options.container);

    handlers.ready!();
    expect(options.onReady).toHaveBeenCalled();
    handlers.sessionEnd!({ sessionEndType: "signing_complete" });
    expect(options.onSessionEnd).toHaveBeenCalledWith({ sessionEndType: "signing_complete" });

    handle.destroy();
    expect(destroy).toHaveBeenCalled();
  });

  it("gives the mounted frame the container's height rather than the library's floor", async () => {
    const options = baseOptions();
    document.body.appendChild(options.container);
    Object.defineProperty(options.container, "clientHeight", { configurable: true, value: 700 });

    await startEmbeddedSigning(options);

    expect(options.container.querySelector("iframe")?.style.minHeight).toBe("700px");
  });

  it("refuses a library from anywhere but DocuSign", async () => {
    await expect(
      startEmbeddedSigning({ ...baseOptions(), scriptUrl: "https://cdn.example.com/bundle.js" })
    ).rejects.toThrow("signing_library_not_allowed");
    await expect(
      startEmbeddedSigning({ ...baseOptions(), scriptUrl: "http://js-d.docusign.com/bundle.js" })
    ).rejects.toThrow("signing_library_not_allowed");
    expect(loadDocuSign).not.toHaveBeenCalled();
  });
});
