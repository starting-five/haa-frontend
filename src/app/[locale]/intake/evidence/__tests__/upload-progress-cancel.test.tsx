import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";
import type { UploadedFile } from "@/types/intake";
import type { SignedUploadRequest } from "@/lib/signed-upload";

// HP#127 — the evidence screen with the real upload hook, and the network layer
// (lib/signed-upload) replaced by uploads each test drives by hand: the bytes
// the browser reports sent, the moment Storage answers, a failure. That is what
// shows whether the percentage is real, whether Cancel stops and undoes this
// visit's uploads, and whether a late answer can bring a cancelled file back.

const push = vi.fn();
let manageToken: string | null = null;
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/intake/evidence",
  useSearchParams: () => new URLSearchParams(manageToken ? `manage=${manageToken}` : ""),
}));
vi.mock("@/hooks/use-require-session-key", () => ({ useRequireSessionKey: () => {} }));
vi.mock("next/image", () => ({ default: () => <span data-testid="next-image" /> }));
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);

type InFlight = SignedUploadRequest & {
  resolve: () => void;
  reject: (error: unknown) => void;
  // A response already on its way when Cancel landed: the abort cannot stop it.
  ignoreAbort?: boolean;
};
const inFlight: InFlight[] = [];

vi.mock("@/lib/signed-upload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/signed-upload")>();
  return {
    ...actual,
    uploadToSignedUrl: (request: SignedUploadRequest) =>
      new Promise<void>((resolve, reject) => {
        const entry: InFlight = { ...request, resolve, reject };
        inFlight.push(entry);
        request.signal?.addEventListener("abort", () => {
          if (!entry.ignoreAbort) reject(new actual.UploadCancelledError());
        });
      }),
  };
});

let keyCounter = 0;
let holdUploadUrl: Promise<void> | null = null;
const createDocumentUploadUrl = vi.fn(async ({ fileName, category }: { fileName: string; category?: string }) => {
  if (holdUploadUrl) await holdUploadUrl;
  keyCounter += 1;
  return { storagePath: `sub-1/${category}/${keyCounter}-${fileName}`, token: "tok" };
});
const deleteDocument = vi.fn(async (_payload: { submissionId: string; storagePath: string }) => {});
vi.mock("@/services/intake", () => ({
  createDocumentUploadUrl: (payload: { fileName: string; category?: string }) => createDocumentUploadUrl(payload),
  deleteDocument: (payload: { submissionId: string; storagePath: string }) => deleteDocument(payload),
}));

import { UploadRequestError } from "@/lib/signed-upload";
import EvidencePage from "../page";

const renderPage = (messages: typeof en | typeof es = en, locale = "en") =>
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
    >
      <EvidencePage />
    </NextIntlClientProvider>
  );

const MB = 1024 * 1024;
const pdf = (name = "police-report.pdf", size = 4 * MB) =>
  new File([new Uint8Array(size)], name, { type: "application/pdf" });

const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;
const pick = async (...files: File[]) => {
  await act(async () => {
    fireEvent.change(fileInput(), { target: { files } });
  });
};
const categoryButton = (key: keyof typeof en.IntakeEvidence.category, messages: typeof en | typeof es = en) =>
  screen.getByRole("button", { name: (name) => name.startsWith(messages.IntakeEvidence.category[key]) });
const addReport = async (messages: typeof en | typeof es = en, ...files: File[]) => {
  fireEvent.click(categoryButton("accidentReport", messages));
  fireEvent.click(
    screen.getByRole("button", { name: (name) => name.startsWith(messages.IntakeEvidence.source.chooseDocument) })
  );
  await pick(...(files.length ? files : [pdf()]));
};
const openList = (messages: typeof en | typeof es = en) =>
  fireEvent.click(screen.getByRole("button", { name: messages.IntakeEvidence.continue }));
const cancel = async (messages: typeof en | typeof es = en) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: messages.IntakeEvidence.cancel }));
  });
};

const saved = () => JSON.parse(sessionStorage.getItem("intake_documents") ?? "[]") as UploadedFile[];
const progressbar = () => screen.queryByRole("progressbar");
const uploadingRow = () => screen.queryByTestId("category-upload-accidentReport");
const attachedRows = () => screen.queryAllByTestId("category-document-accidentReport");

let now = 0;
const send = async (index: number, loaded: number, total = 4 * MB, atMs?: number) => {
  if (atMs !== undefined) now = atMs;
  await act(async () => inFlight[index].onProgress?.({ loaded, total }));
};
const finish = async (index: number) => {
  await act(async () => inFlight[index].resolve());
};
const started = (count = 1) => waitFor(() => expect(inFlight).toHaveLength(count));

beforeEach(() => {
  manageToken = null;
  inFlight.length = 0;
  keyCounter = 0;
  holdUploadUrl = null;
  now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  sessionStorage.clear();
  sessionStorage.setItem("intake_submissionId", "sub-1");
  push.mockReset();
  createDocumentUploadUrl.mockClear();
  deleteDocument.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:preview", revokeObjectURL: () => {} }));
  // jsdom decodes no image, so the hook's webp re-encode would never settle;
  // failing the decode is a browser's path for a file it cannot read, and the
  // hook falls back to the original bytes.
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("upload progress", () => {
  it("shows the real share sent where the spinner was, and the document once Storage answers", async () => {
    renderPage();
    openList();
    await addReport();
    await started();

    // Before the first byte: 0%, the ring turning, never a bare spinner.
    expect(uploadingRow()).toHaveTextContent(en.IntakeEvidence.uploadingFile);
    expect(progressbar()).toHaveAttribute("aria-valuenow", "0");
    expect(progressbar()!.querySelector("svg")).toHaveAttribute("data-phase", "preparing");
    expect(uploadingRow()!.querySelector(".animate-spin:not(svg[data-phase])")).toBeNull();

    for (const percent of [25, 50, 75]) {
      await send(0, (4 * MB * percent) / 100);
      expect(progressbar()).toHaveAttribute("aria-valuenow", String(percent));
      expect(within(uploadingRow()!).getByText(`${percent}%`)).toBeInTheDocument();
      // still going up: nothing attached, nothing to continue with
      expect(attachedRows()).toHaveLength(0);
      expect(saved()).toEqual([]);
      expect(screen.queryByRole("button", { name: en.IntakeEvidence.continueAfterSelect })).toBeNull();
    }

    // every byte sent is not yet stored: it holds at 99 until Storage answers
    await send(0, 4 * MB);
    expect(progressbar()).toHaveAttribute("aria-valuenow", "99");
    expect(attachedRows()).toHaveLength(0);

    await finish(0);
    await waitFor(() => expect(attachedRows()).toHaveLength(1));
    expect(uploadingRow()).toBeNull();
    expect(progressbar()).toBeNull();
    expect(saved().map((doc) => doc.fileName)).toEqual(["police-report.pdf"]);
  });

  it("climbs through every real value the browser reports, never back, never early to 100", async () => {
    renderPage();
    openList();
    await addReport();
    await started();

    const shown: number[] = [];
    const read = () => Number(progressbar()!.getAttribute("aria-valuenow"));
    shown.push(read());
    for (const percent of [5, 17, 32, 48, 67, 83, 96]) {
      await send(0, Math.ceil((4 * MB * percent) / 100));
      shown.push(read());
      expect(within(uploadingRow()!).getByText(`${percent}%`)).toBeInTheDocument();
    }
    expect(shown).toEqual([0, 5, 17, 32, 48, 67, 83, 96]);

    // a late or reordered event never moves it back
    await send(0, Math.round(4 * MB * 0.5));
    expect(read()).toBe(96);

    // time passing changes nothing on its own: only upload events move it
    now += 60_000;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(read()).toBe(96);

    // all bytes out, Storage still writing: 99, not 100
    await send(0, 4 * MB);
    expect(read()).toBe(99);
    expect(screen.queryByText("100%")).toBeNull();

    await finish(0);
    await waitFor(() => expect(attachedRows()).toHaveLength(1));
  });

  it("names the time left once the rate has settled, and nothing it does not know", async () => {
    renderPage();
    openList();
    await addReport();
    await started();

    await send(0, 0.8 * MB, 8 * MB, 1_000_000);
    await send(0, 1.2 * MB, 8 * MB, 1_000_500);
    // half a second in: too early to say
    expect(uploadingRow()).not.toHaveTextContent("left");

    // a steady 0.8 MB/s with 6.4 MB to go: eight seconds
    await send(0, 1.6 * MB, 8 * MB, 1_001_000);
    expect(uploadingRow()).toHaveTextContent(`${en.IntakeEvidence.uploadingFile} · about 8 sec left`);
    expect(uploadingRow()!.textContent).not.toMatch(/NaN|Infinity|-\d/);

    // nearly there: no estimate for the last moment
    await send(0, 7.9 * MB, 8 * MB, 1_003_000);
    expect(uploadingRow()).not.toHaveTextContent("left");
  });

  it("keeps each file's progress on its own row, beside what an earlier round attached", async () => {
    renderPage();
    openList();
    // an earlier round: the licence, attached
    fireEvent.click(categoryButton("driversLicense"));
    fireEvent.click(
      screen.getByRole("button", { name: (name) => name.startsWith(en.IntakeEvidence.source.choosePhotos) })
    );
    await pick(new File([new Uint8Array(2048)], "licence.png", { type: "image/png" }));
    await started();
    await finish(0);
    await waitFor(() => expect(screen.getAllByTestId("category-document-driversLicense")).toHaveLength(1));

    // this round: two reports going up together
    await addReport(en, pdf("report.pdf"), pdf("exchange.pdf"));
    await started(3);
    await send(1, 0.42 * 4 * MB);
    await send(2, 0.8 * 4 * MB);

    const rows = screen.getAllByTestId("category-upload-accidentReport");
    const percentOf = (name: string) =>
      within(rows.find((row) => row.textContent?.includes(name))!)
        .getByRole("progressbar")
        .getAttribute("aria-valuenow");
    expect(percentOf("report.pdf")).toBe("42");
    expect(percentOf("exchange.pdf")).toBe("80");
    // the licence card is not touched by either
    expect(screen.getAllByTestId("category-document-driversLicense")[0]).not.toHaveTextContent("%");
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);

    await finish(1);
    await finish(2);
    await waitFor(() => expect(attachedRows()).toHaveLength(2));
    expect(progressbar()).toBeNull();
  });

  it("lets Continue through only once nothing is going up", async () => {
    renderPage();
    openList();
    await addReport();
    await started();
    await send(0, 2 * MB);
    expect(screen.queryByRole("button", { name: en.IntakeEvidence.continueAfterSelect })).toBeNull();

    await finish(0);
    const proceed = await screen.findByRole("button", { name: en.IntakeEvidence.continueAfterSelect });
    fireEvent.click(proceed);
    expect(push).toHaveBeenCalledWith("/en/intake/review");
    expect(saved()).toHaveLength(1);
    expect(deleteDocument).not.toHaveBeenCalled();
  });
});

describe("Cancel", () => {
  it("stops an upload at 42%, with no error, and the file is gone when the list is opened again", async () => {
    renderPage();
    openList();
    await addReport();
    await started();
    await send(0, 0.42 * 4 * MB);
    expect(progressbar()).toHaveAttribute("aria-valuenow", "42");

    await cancel();

    expect(inFlight[0].signal?.aborted).toBe(true);
    // back where the patient came from, and no failure shown for a stop they chose
    expect(screen.getByRole("button", { name: en.IntakeEvidence.continue })).toBeInTheDocument();
    expect(screen.queryByText(en.IntakeEvidence.uploadFailed)).toBeNull();
    // whatever may have reached Storage under the key it was given is deleted
    await waitFor(() =>
      expect(deleteDocument).toHaveBeenCalledWith({
        submissionId: "sub-1",
        storagePath: "sub-1/accidentReport/1-police-report.pdf",
      })
    );

    openList();
    expect(uploadingRow()).toBeNull();
    expect(attachedRows()).toHaveLength(0);
    expect(progressbar()).toBeNull();
    expect(saved()).toEqual([]);
  });

  it("takes back what this visit attached, and keeps what an earlier visit attached", async () => {
    const { addDocuments } = await import("@/lib/intake-documents");
    addDocuments(
      sessionStorage,
      [
        {
          fileName: "licence.png",
          storagePath: "sub-1/driversLicense/0-licence.png",
          mimeType: "image/png",
          fileSize: 1200,
          category: "driversLicense",
        },
      ],
      "driversLicense"
    );
    renderPage();
    openList();
    await addReport();
    await started();
    await finish(0);
    await waitFor(() => expect(attachedRows()).toHaveLength(1));
    expect(saved()).toHaveLength(2);

    await cancel();

    expect(saved().map((doc) => doc.storagePath)).toEqual(["sub-1/driversLicense/0-licence.png"]);
    expect(deleteDocument).toHaveBeenCalledTimes(1);
    expect(deleteDocument).toHaveBeenCalledWith({
      submissionId: "sub-1",
      storagePath: "sub-1/accidentReport/1-police-report.pdf",
    });

    openList();
    expect(attachedRows()).toHaveLength(0);
    expect(screen.getAllByTestId("category-document-driversLicense")).toHaveLength(1);
  });

  it("does not let an upload that finishes as Cancel lands come back", async () => {
    renderPage();
    openList();
    await addReport();
    await started();
    await send(0, 0.95 * 4 * MB);
    inFlight[0].ignoreAbort = true;

    await cancel();
    // Storage's answer arrives after the stop
    await finish(0);

    await waitFor(() =>
      expect(deleteDocument).toHaveBeenCalledWith({
        submissionId: "sub-1",
        storagePath: "sub-1/accidentReport/1-police-report.pdf",
      })
    );
    expect(saved()).toEqual([]);
    openList();
    expect(attachedRows()).toHaveLength(0);
    expect(uploadingRow()).toBeNull();
  });

  it("stops an upload cancelled before its upload URL came back, so it never starts", async () => {
    let release: () => void = () => {};
    holdUploadUrl = new Promise((resolve) => (release = resolve));
    renderPage();
    openList();
    await addReport();
    await waitFor(() => expect(createDocumentUploadUrl).toHaveBeenCalledTimes(1));

    await cancel();
    await act(async () => release());

    expect(inFlight).toHaveLength(0);
    expect(saved()).toEqual([]);
    openList();
    expect(uploadingRow()).toBeNull();
  });

  it("from the case summary, goes back there with only this visit's upload undone", async () => {
    manageToken = "t1";
    renderPage();
    await addReport();
    await started();
    await finish(0);
    await waitFor(() => expect(attachedRows()).toHaveLength(1));

    await cancel();

    expect(push).toHaveBeenCalledWith("/en/intake/review");
    expect(saved()).toEqual([]);
    expect(deleteDocument).toHaveBeenCalledTimes(1);
  });

  it("is Cancelar in Spanish, mid-upload, with the time left in Spanish", async () => {
    renderPage(es, "es");
    openList(es);
    await addReport(es);
    await started();
    await send(0, 0.8 * MB, 8 * MB, 1_000_000);
    await send(0, 1.2 * MB, 8 * MB, 1_000_500);
    await send(0, 1.6 * MB, 8 * MB, 1_001_000);
    expect(uploadingRow()).toHaveTextContent(`${es.IntakeEvidence.uploadingFile} · quedan unos 8 s`);

    await cancel(es);
    expect(inFlight[0].signal?.aborted).toBe(true);
    expect(screen.queryByText(es.IntakeEvidence.uploadFailed)).toBeNull();
  });
});

describe("a failed upload", () => {
  it("stops the progress, says so, records nothing, and goes again once removed and re-picked", async () => {
    renderPage();
    openList();
    await addReport();
    await started();
    await send(0, 2 * MB);
    await act(async () => inFlight[0].reject(new UploadRequestError("storage unavailable", true)));

    await waitFor(() => expect(uploadingRow()).toHaveTextContent(en.IntakeEvidence.uploadFailed));
    expect(progressbar()).toBeNull();
    expect(screen.queryByText("100%")).toBeNull();
    expect(saved()).toEqual([]);
    // Storage answered with a refusal, so nothing was written to clean up
    expect(deleteDocument).not.toHaveBeenCalled();

    // the existing way to try again: remove it and choose it again
    fireEvent.click(screen.getByRole("button", { name: "Remove police-report.pdf" }));
    await addReport();
    await started(2);
    await finish(1);
    await waitFor(() => expect(attachedRows()).toHaveLength(1));
    expect(saved().map((doc) => doc.storagePath)).toEqual(["sub-1/accidentReport/2-police-report.pdf"]);
  });

  it("cleans up after a connection that dropped before Storage answered", async () => {
    renderPage();
    openList();
    await addReport();
    await started();
    await act(async () => inFlight[0].reject(new UploadRequestError("Network error during upload", false)));

    await waitFor(() => expect(uploadingRow()).toHaveTextContent(en.IntakeEvidence.uploadFailed));
    expect(deleteDocument).toHaveBeenCalledWith({
      submissionId: "sub-1",
      storagePath: "sub-1/accidentReport/1-police-report.pdf",
    });
    expect(saved()).toEqual([]);
  });
});

// Photos take the same road as every other file — the hook, the backend-minted
// key, lib/signed-upload's transport — with one step of their own first: the
// hook re-encodes them as webp. These pin that a photo shows its real share sent
// from the moment it is queued, and is stopped and undone by Cancel like a PDF.
describe("a photo", () => {
  const photo = (name = "IMG_2041.jpg", size = 5 * MB) =>
    new File([new Uint8Array(size)], name, { type: "image/jpeg" });
  const photoRows = () => screen.queryAllByTestId("category-upload-incidentPhotos");
  const attachedPhotos = () => screen.queryAllByTestId("category-document-incidentPhotos");
  const addPhotos = async (messages: typeof en | typeof es = en, ...files: File[]) => {
    fireEvent.click(categoryButton("incidentPhotos", messages));
    fireEvent.click(
      screen.getByRole("button", { name: (name) => name.startsWith(messages.IntakeEvidence.source.choosePhotos) })
    );
    await pick(...(files.length ? files : [photo()]));
  };

  // The decode the re-encode waits on, held until the test lets it go, so the
  // moment before the first byte can be looked at.
  let decode: Array<() => void> = [];
  beforeEach(() => {
    decode = [];
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          decode.push(() => this.onerror?.());
        }
      }
    );
  });
  const finishDecoding = async () => {
    await act(async () => {
      for (const done of decode.splice(0)) done();
    });
  };

  it("shows 0% while it is prepared, then the real share sent, then attached", async () => {
    renderPage();
    openList();
    await addPhotos();

    // being re-encoded: nothing sent yet, and the row says so with a number
    await waitFor(() => expect(within(photoRows()[0]).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0"));
    expect(within(photoRows()[0]).getByText("0%")).toBeInTheDocument();
    expect(photoRows()[0].querySelector('svg[data-phase="preparing"]')).not.toBeNull();
    expect(inFlight).toHaveLength(0);

    await finishDecoding();
    await started();
    // it went through the progress-aware transport, as the photo it is
    expect(inFlight[0].file).toBeInstanceOf(File);
    expect(inFlight[0].storagePath).toMatch(/^sub-1\/incidentPhotos\//);

    for (const percent of [25, 50, 75]) {
      await send(0, (5 * MB * percent) / 100, 5 * MB);
      const bar = within(photoRows()[0]).getByRole("progressbar");
      expect(bar).toHaveAttribute("aria-valuenow", String(percent));
      expect(bar.querySelector("svg")).toHaveAttribute("data-phase", "sending");
      expect(within(photoRows()[0]).getByText(`${percent}%`)).toBeInTheDocument();
      expect(attachedPhotos()).toHaveLength(0);
    }
    await send(0, 5 * MB - 1, 5 * MB);
    expect(within(photoRows()[0]).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "99");

    await finish(0);
    await waitFor(() => expect(attachedPhotos()).toHaveLength(1));
    expect(photoRows()).toHaveLength(0);
    expect(saved().map((doc) => doc.category)).toEqual(["incidentPhotos"]);
  });

  it("is cancelled part-way: aborted, gone from the card, and not there when Photos is opened again", async () => {
    renderPage();
    openList();
    await addPhotos();
    await finishDecoding();
    await started();
    await send(0, 0.4 * 5 * MB, 5 * MB);

    await cancel();

    expect(inFlight[0].signal?.aborted).toBe(true);
    expect(screen.queryByText(en.IntakeEvidence.uploadFailed)).toBeNull();
    await waitFor(() =>
      expect(deleteDocument).toHaveBeenCalledWith({
        submissionId: "sub-1",
        storagePath: "sub-1/incidentPhotos/1-IMG_2041.jpg",
      })
    );
    openList();
    expect(photoRows()).toHaveLength(0);
    expect(attachedPhotos()).toHaveLength(0);
    expect(saved()).toEqual([]);
  });

  it("is cancelled while still being prepared, so it is never sent", async () => {
    renderPage();
    openList();
    await addPhotos();
    await waitFor(() => expect(within(photoRows()[0]).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0"));

    await cancel();
    await finishDecoding();

    expect(inFlight).toHaveLength(0);
    expect(saved()).toEqual([]);
    openList();
    expect(photoRows()).toHaveLength(0);
  });

  it("fails cleanly and goes again once removed and re-picked", async () => {
    renderPage();
    openList();
    await addPhotos();
    await finishDecoding();
    await started();
    await send(0, 2 * MB, 5 * MB);
    await act(async () => inFlight[0].reject(new UploadRequestError("storage unavailable", true)));

    await waitFor(() => expect(photoRows()[0]).toHaveTextContent(en.IntakeEvidence.uploadFailed));
    expect(within(photoRows()[0]).queryByRole("progressbar")).toBeNull();
    expect(saved()).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Remove IMG_2041.jpg" }));
    await addPhotos();
    await finishDecoding();
    await started(2);
    await finish(1);
    await waitFor(() => expect(attachedPhotos()).toHaveLength(1));
  });

  it("keeps each photo's progress its own", async () => {
    renderPage();
    openList();
    await addPhotos(en, photo("IMG_1.jpg"), photo("IMG_2.jpg"), photo("IMG_3.jpg"));
    await finishDecoding();
    await started(3);
    const at = (name: string) => inFlight.findIndex((upload) => upload.storagePath.endsWith(name));

    await send(at("IMG_1.jpg"), 0.42 * 5 * MB, 5 * MB);
    await send(at("IMG_2.jpg"), 0.81 * 5 * MB, 5 * MB);
    await send(at("IMG_3.jpg"), 5 * MB, 5 * MB);
    await finish(at("IMG_3.jpg"));

    const percentOf = (name: string) =>
      within(photoRows().find((row) => row.textContent?.includes(name))!)
        .getByRole("progressbar")
        .getAttribute("aria-valuenow");
    expect(percentOf("IMG_1.jpg")).toBe("42");
    expect(percentOf("IMG_2.jpg")).toBe("81");
    expect(percentOf("IMG_3.jpg")).toBe("100");

    // IMG_3 is complete: 100, while its batch-mates are still going up
    for (const name of ["IMG_1.jpg", "IMG_2.jpg"]) await finish(at(name));
    await waitFor(() => expect(attachedPhotos()).toHaveLength(3));
  });

  it("shows its progress in Spanish", async () => {
    renderPage(es, "es");
    openList(es);
    await addPhotos(es);
    await waitFor(() => expect(within(photoRows()[0]).getByText("0%")).toBeInTheDocument());
    expect(photoRows()[0]).toHaveTextContent(es.IntakeEvidence.uploadingFile);
    await finishDecoding();
    await started();
    await send(0, 0.37 * 5 * MB, 5 * MB);
    expect(within(photoRows()[0]).getByText("37%")).toBeInTheDocument();
    await cancel(es);
    expect(inFlight[0].signal?.aborted).toBe(true);
  });
});
