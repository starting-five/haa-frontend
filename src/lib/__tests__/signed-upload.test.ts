import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isUploadCancelled, UploadCancelledError, UploadRequestError, uploadToSignedUrl } from "@/lib/signed-upload";

// The transport the evidence upload goes through: the request supabase-js's
// uploadToSignedUrl makes, sent with XMLHttpRequest so its bytes can be counted
// and it can be stopped. A fake XHR stands in for the network.

class FakeXhr {
  static last: FakeXhr | null = null;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: FormData | null = null;
  status = 0;
  responseText = "";
  aborted = false;
  upload: {
    onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
    onload: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
  } = { onprogress: null, onload: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: FormData) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  // test controls
  progress(loaded: number, total: number, lengthComputable = true) {
    this.upload.onprogress?.({ lengthComputable, loaded, total });
  }
  bodySent(total: number) {
    this.upload.onload?.({ lengthComputable: true, loaded: total, total });
  }
  respond(status: number, responseText = "") {
    this.status = status;
    this.responseText = responseText;
    this.onload?.();
  }
}

const file = new File([new Uint8Array(1000)], "police report.pdf", { type: "application/pdf" });
const request = (extra: Partial<Parameters<typeof uploadToSignedUrl>[0]> = {}) =>
  uploadToSignedUrl({
    bucket: "submissions",
    storagePath: "sub-1/accidentReport/police report-1.pdf",
    token: "tok/+=",
    file,
    ...extra,
  });

beforeEach(() => {
  FakeXhr.last = null;
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("uploadToSignedUrl", () => {
  it("sends the signed-upload PUT supabase-js sends: token in the URL, cache-control then the file", async () => {
    const done = request({ cacheControl: "3600", upsert: false });
    const xhr = FakeXhr.last!;

    expect(xhr.method).toBe("PUT");
    const url = new URL(xhr.url);
    expect(url.origin + url.pathname).toBe(
      "http://127.0.0.1:54321/storage/v1/object/upload/sign/submissions/sub-1/accidentReport/police%20report-1.pdf"
    );
    expect(url.searchParams.get("token")).toBe("tok/+=");
    expect(xhr.headers).toEqual({ apikey: "sb_publishable_test", "x-upsert": "false" });
    expect([...xhr.body!.keys()]).toEqual(["cacheControl", ""]);
    expect(xhr.body!.get("cacheControl")).toBe("3600");
    expect((xhr.body!.get("") as File).name).toBe("police report.pdf");

    xhr.respond(200, JSON.stringify({ Key: "submissions/sub-1/accidentReport/police report-1.pdf" }));
    await expect(done).resolves.toBeUndefined();
  });

  it("reports the bytes the browser has sent, and only when it knows the total", async () => {
    const onProgress = vi.fn();
    const done = request({ onProgress });
    const xhr = FakeXhr.last!;

    xhr.progress(250, 1000);
    xhr.progress(600, 1000, false);
    xhr.progress(1000, 1000);
    expect(onProgress.mock.calls).toEqual([[{ loaded: 250, total: 1000 }], [{ loaded: 1000, total: 1000 }]]);

    xhr.respond(200, "{}");
    await done;
  });

  it("reports the whole body sent even when it went between two progress events", async () => {
    // a re-encoded photo is small enough to be sent before the first tick
    const onProgress = vi.fn();
    const done = request({ onProgress });
    const xhr = FakeXhr.last!;

    xhr.bodySent(647_091);
    expect(onProgress).toHaveBeenCalledWith({ loaded: 647_091, total: 647_091 });

    xhr.respond(200, "{}");
    await done;
  });

  it("rejects a refusal Storage answered, with its message, as answered", async () => {
    const done = request();
    FakeXhr.last!.respond(400, JSON.stringify({ message: "The resource already exists" }));
    const error = await done.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UploadRequestError);
    expect(error).toMatchObject({ message: "The resource already exists", answered: true });
    expect(isUploadCancelled(error)).toBe(false);
  });

  it("falls back to the status when the refusal is not JSON", async () => {
    const done = request();
    FakeXhr.last!.respond(502, "<html>bad gateway</html>");
    await expect(done).rejects.toMatchObject({ message: "Upload failed with status 502", answered: true });
  });

  it("rejects a dropped connection as unanswered", async () => {
    const done = request();
    FakeXhr.last!.onerror?.();
    await expect(done).rejects.toMatchObject({ name: "UploadRequestError", answered: false });
  });

  it("aborts the request when the signal fires, as a cancellation rather than a failure", async () => {
    const controller = new AbortController();
    const done = request({ signal: controller.signal });
    const xhr = FakeXhr.last!;

    controller.abort();

    expect(xhr.aborted).toBe(true);
    const error = await done.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UploadCancelledError);
    expect(isUploadCancelled(error)).toBe(true);
  });

  it("does not open a request at all for a signal already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(request({ signal: controller.signal })).rejects.toBeInstanceOf(UploadCancelledError);
    expect(FakeXhr.last).toBeNull();
  });
});
