import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { SignedUploadRequest } from "@/lib/signed-upload";

// The upload hook on its own: what it keeps after cancel() when Storage's answer
// arrives anyway. The evidence screen clears its own state on Cancel too, so
// only a test of the hook shows the hook itself records nothing late.

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

type InFlight = SignedUploadRequest & { resolve: () => void };
const inFlight: InFlight[] = [];
vi.mock("@/lib/signed-upload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/signed-upload")>();
  return {
    ...actual,
    // a response already on its way: the abort does not stop it
    uploadToSignedUrl: (request: SignedUploadRequest) =>
      new Promise<void>((resolve) => inFlight.push({ ...request, resolve })),
  };
});

import { useSupabaseUpload } from "@/hooks/use-supabase-upload";

const getSignedUpload = vi.fn(async (file: File) => ({
  storagePath: `sub-1/accidentReport/k-${file.name}`,
  token: "t",
}));
const deleteUploadedFile = vi.fn(async (_file: { name: string; storagePath: string }) => {});

const withFile = () => {
  const view = renderHook(() =>
    useSupabaseUpload({ bucketName: "submissions", maxFiles: 8, getSignedUpload, deleteUploadedFile })
  );
  const file = Object.assign(new File([new Uint8Array(10)], "report.pdf", { type: "application/pdf" }), {
    errors: [],
  });
  act(() => view.result.current.setFiles([file]));
  return view;
};

beforeEach(() => {
  inFlight.length = 0;
  getSignedUpload.mockClear();
  deleteUploadedFile.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.clearAllMocks());

describe("useSupabaseUpload cancel()", () => {
  it("records nothing from an upload that completes after it was cancelled, and deletes what it wrote", async () => {
    const view = withFile();
    let upload: Promise<void> = Promise.resolve();
    act(() => {
      upload = view.result.current.onUpload();
    });
    await waitFor(() => expect(inFlight).toHaveLength(1));
    act(() => inFlight[0].onProgress?.({ loaded: 5, total: 10 }));
    expect(view.result.current.progress["report.pdf"]?.percent).toBe(50);

    act(() => view.result.current.cancel());
    expect(inFlight[0].signal?.aborted).toBe(true);
    expect(view.result.current.progress).toEqual({});
    expect(view.result.current.loading).toBe(false);

    await act(async () => {
      inFlight[0].resolve();
      await upload;
    });

    expect(view.result.current.successes).toEqual([]);
    expect(view.result.current.errors).toEqual([]);
    expect(view.result.current.progress).toEqual({});
    expect(view.result.current.loading).toBe(false);
    expect(view.result.current.files[0].storagePath).toBeUndefined();
    expect(deleteUploadedFile).toHaveBeenCalledWith({
      name: "report.pdf",
      storagePath: "sub-1/accidentReport/k-report.pdf",
    });
  });

  it("still records an upload that was not cancelled", async () => {
    const view = withFile();
    let upload: Promise<void> = Promise.resolve();
    act(() => {
      upload = view.result.current.onUpload();
    });
    await waitFor(() => expect(inFlight).toHaveLength(1));
    await act(async () => {
      inFlight[0].resolve();
      await upload;
    });

    expect(view.result.current.successes).toEqual(["report.pdf"]);
    expect(view.result.current.files[0].storagePath).toBe("sub-1/accidentReport/k-report.pdf");
    expect(deleteUploadedFile).not.toHaveBeenCalled();
  });
});
