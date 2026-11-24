import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";
import type { UploadedFile } from "@/types/intake";

// Tapping a category shows the app's source sheet; choosing a source opens the
// native picker; what is picked uploads straight into that category's card.
// There is no upload screen in between. These tests drive the real upload hook
// — only the backend services and the Storage client are mocked — because the
// sheet, the file input and the picker's accept attributes are precisely what
// a mocked hook would paper over.

const push = vi.fn();
let manageToken: string | null = null;
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/intake/evidence",
  useSearchParams: () => new URLSearchParams(manageToken ? `manage=${manageToken}` : ""),
}));

vi.mock("@/hooks/use-require-session-key", () => ({ useRequireSessionKey: () => {} }));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt?: string }) => (
    <span
      data-testid="next-image"
      aria-label={alt}
    />
  ),
}));

const uploadToSignedUrl = vi.fn<(path: string, token: string, file: File) => Promise<{ error: unknown }>>();
const createSignedUrl = vi.fn(async () => ({ data: null, error: { message: "Object not found" } }));
vi.mock("@/lib/supabase/client", async () => {
  const { headerOnlySupabaseClient } = await import("@/test-utils/supabase-client-mock");
  const header = headerOnlySupabaseClient().createClient();
  return {
    createClient: () => ({
      ...header,
      storage: { from: () => ({ uploadToSignedUrl, createSignedUrl }) },
    }),
  };
});

let keyCounter = 0;
const createDocumentUploadUrl = vi.fn(async ({ fileName, category }: { fileName: string; category?: string }) => {
  keyCounter += 1;
  const dot = fileName.lastIndexOf(".");
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : "";
  return { storagePath: `sub-1/${category}/${stem}-${keyCounter.toString(16).padStart(8, "0")}${ext}`, token: "tok" };
});
const deleteDocument = vi.fn(async (_payload: { submissionId: string; storagePath: string }) => {});
// The hook sends files through lib/signed-upload's transport; it is routed to
// the storage stub above so these tests keep observing every upload there.
vi.mock("@/lib/signed-upload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/signed-upload")>();
  return {
    ...actual,
    uploadToSignedUrl: async ({ storagePath, token, file }: { storagePath: string; token: string; file: File }) => {
      const { error } = (await uploadToSignedUrl(storagePath, token, file)) as { error: unknown };
      // Storage answered with an error: nothing was written.
      if (error) throw new actual.UploadRequestError((error as { message?: string }).message ?? "Upload failed", true);
    },
  };
});

vi.mock("@/services/intake", () => ({
  createDocumentUploadUrl: (payload: { fileName: string; category?: string }) => createDocumentUploadUrl(payload),
  deleteDocument: (payload: { submissionId: string; storagePath: string }) => deleteDocument(payload),
}));

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

// Real files of the kinds a patient actually has on a phone.
const photo = (name = "crash.jpg") => new File([new Uint8Array(64)], name, { type: "image/jpeg" });
const licencePhoto = () => new File([new Uint8Array(48)], "licence.png", { type: "image/png" });
const insurancePdf = () => new File([new Uint8Array(96)], "policy.pdf", { type: "application/pdf" });
const reportPdf = () => new File([new Uint8Array(128)], "police-report.pdf", { type: "application/pdf" });
const clip = () => new File([new Uint8Array(256)], "dashcam.mp4", { type: "video/mp4" });

const fileInput = () => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("the screen is not holding a file input");
  return input;
};

const sheet = () => screen.queryByRole("dialog");

const categoryButton = (category: keyof typeof en.IntakeEvidence.category, messages: typeof en | typeof es = en) =>
  screen.getByRole("button", { name: (name) => name.startsWith(messages.IntakeEvidence.category[category]) });

const sourceButton = (label: string) => screen.getByRole("button", { name: (name) => name.startsWith(label) });

const chooseSource = (label: string) => fireEvent.click(sourceButton(label));

const pick = async (...files: File[]) => {
  await act(async () => {
    fireEvent.change(fileInput(), { target: { files } });
  });
};

const savedDocuments = () => JSON.parse(sessionStorage.getItem("intake_documents") ?? "[]") as UploadedFile[];

const openCategoryList = () => fireEvent.click(screen.getByRole("button", { name: en.IntakeEvidence.continue }));

// The list itself, which never gives way to an upload screen.
const categoryListShowing = () => {
  expect(screen.getByText(en.IntakeEvidence.categoryHeading)).toBeInTheDocument();
  for (const category of ["accidentReport", "incidentPhotos", "insuranceCard", "driversLicense"] as const) {
    expect(categoryButton(category)).toBeInTheDocument();
  }
};

// Opens a category's sheet and chooses a source, the way a patient does.
const addTo = (category: keyof typeof en.IntakeEvidence.category, source: string) => {
  fireEvent.click(categoryButton(category));
  chooseSource(source);
};

// jsdom decodes nothing, so the image the hook loads to re-encode as webp
// would never settle. Failing the decode is the path a browser takes for a
// file it cannot read, and the hook falls back to the original bytes.
const stubBrowserImages = () => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:preview", revokeObjectURL: () => {} }));
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
};

const resetBackend = () => {
  manageToken = null;
  sessionStorage.clear();
  sessionStorage.setItem("intake_submissionId", "sub-1");
  keyCounter = 0;
  push.mockReset();
  createDocumentUploadUrl.mockClear();
  deleteDocument.mockReset();
  deleteDocument.mockResolvedValue(undefined);
  uploadToSignedUrl.mockReset();
  uploadToSignedUrl.mockResolvedValue({ error: null });
};

describe("choosing where a document comes from", () => {
  beforeEach(() => {
    resetBackend();
    stubBrowserImages();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("asks where a photo comes from, and offers no document, on the Photos card", () => {
    renderPage();
    openCategoryList();

    fireEvent.click(categoryButton("incidentPhotos"));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(sourceButton(en.IntakeEvidence.source.takePhoto)).toBeInTheDocument();
    expect(sourceButton(en.IntakeEvidence.source.choosePhotos)).toBeInTheDocument();
    // The category takes photos only, so a document picker would open onto
    // files it then refuses.
    expect(screen.queryByRole("button", { name: en.IntakeEvidence.source.chooseDocument })).not.toBeInTheDocument();
  });

  it("opens nothing in the tap on a card — the sheet asks first", () => {
    renderPage();
    openCategoryList();

    const clicks: string[] = [];
    const original = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function patched(this: HTMLInputElement) {
      clicks.push(this.type);
    };
    try {
      fireEvent.click(categoryButton("incidentPhotos"));
      expect(clicks).toEqual([]);
      chooseSource(en.IntakeEvidence.source.choosePhotos);
      expect(clicks).toEqual(["file"]);
    } finally {
      HTMLInputElement.prototype.click = original;
    }
  });

  it("shows the sheet once per tap, and never again for that tap", async () => {
    renderPage();
    openCategoryList();
    expect(sheet()).not.toBeInTheDocument();

    fireEvent.click(categoryButton("insuranceCard"));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    // Choosing a source is what opens the native picker. The app's own sheet
    // has done its job and must be gone — on iPhone the platform then shows its
    // own Take Photo / Photo Library sheet, and a second copy of ours behind it
    // made it look like nothing had happened.
    chooseSource(en.IntakeEvidence.source.takePhoto);
    expect(sheet()).not.toBeInTheDocument();

    // ...not when the picker hands files over,
    await pick(photo());
    expect(sheet()).not.toBeInTheDocument();

    // ...not while the upload runs and finishes,
    await waitFor(() => expect(savedDocuments()).toHaveLength(1));
    expect(sheet()).not.toBeInTheDocument();

    // ...and not on a re-render after all of it.
    await act(async () => {
      fireEvent.click(screen.getByText(en.IntakeEvidence.categoryHeading));
    });
    expect(sheet()).not.toBeInTheDocument();
  });

  it("offers a photo, the camera and a document for every category that takes PDFs", () => {
    renderPage();
    openCategoryList();

    for (const category of ["accidentReport", "insuranceCard", "driversLicense"] as const) {
      fireEvent.click(categoryButton(category));
      expect(sourceButton(en.IntakeEvidence.source.takePhoto)).toBeInTheDocument();
      expect(sourceButton(en.IntakeEvidence.source.choosePhotos)).toBeInTheDocument();
      expect(sourceButton(en.IntakeEvidence.source.chooseDocument)).toBeInTheDocument();
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      expect(sheet()).not.toBeInTheDocument();
    }
  });

  it("asks the browser for the camera, the library or the file browser — one at a time", () => {
    renderPage();
    openCategoryList();

    addTo("incidentPhotos", en.IntakeEvidence.source.choosePhotos);
    expect(fileInput().getAttribute("accept")).toBe("image/*");
    expect(fileInput().getAttribute("capture")).toBeNull();

    addTo("incidentPhotos", en.IntakeEvidence.source.takePhoto);
    expect(fileInput().getAttribute("accept")).toBe("image/*");
    expect(fileInput().getAttribute("capture")).toBe("environment");

    addTo("driversLicense", en.IntakeEvidence.source.takePhoto);
    expect(fileInput().getAttribute("accept")).toBe("image/*");
    expect(fileInput().getAttribute("capture")).toBe("environment");

    addTo("accidentReport", en.IntakeEvidence.source.chooseDocument);
    // Never "image/*,application/pdf": iOS makes the PDFs unselectable when a
    // list spans media and documents.
    expect(fileInput().getAttribute("accept")).toBe("application/pdf");
    expect(fileInput().getAttribute("capture")).toBeNull();
  });

  it("opens the picker in the tap that chose the source", () => {
    renderPage();
    openCategoryList();
    fireEvent.click(categoryButton("insuranceCard"));

    const clicks: string[] = [];
    const original = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function patched(this: HTMLInputElement) {
      clicks.push(this.type);
    };
    try {
      fireEvent.click(sourceButton(en.IntakeEvidence.source.choosePhotos));
      expect(clicks).toEqual(["file"]);
    } finally {
      HTMLInputElement.prototype.click = original;
    }
  });

  it("stays on the category list when the picker is closed with nothing", async () => {
    renderPage();
    openCategoryList();
    addTo("incidentPhotos", en.IntakeEvidence.source.takePhoto);
    expect(fileInput().getAttribute("capture")).toBe("environment");

    // A cancelled picker fires no event of its own; it is inferred from the
    // window regaining focus with the input still empty.
    await act(async () => {
      fireEvent.focus(window);
    });
    // The camera is put away: the input no longer carries `capture`.
    await waitFor(() => expect(fileInput().getAttribute("capture")).toBeNull(), { timeout: 2000 });
    categoryListShowing();
    expect(sheet()).not.toBeInTheDocument();
    expect(uploadToSignedUrl).not.toHaveBeenCalled();
  });
});

describe("there is no upload screen", () => {
  beforeEach(() => {
    resetBackend();
    stubBrowserImages();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps the category list on screen from the sheet to the finished upload", async () => {
    renderPage();
    openCategoryList();

    addTo("incidentPhotos", en.IntakeEvidence.source.choosePhotos);
    categoryListShowing();

    await pick(photo());
    categoryListShowing();
    await waitFor(() => expect(savedDocuments()).toHaveLength(1));
    categoryListShowing();

    // No "Selected: …", no drop area, no second way out of an upload view.
    expect(screen.queryByText(/Selected:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Drag and drop/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Maximum file size/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: en.IntakeEvidence.cancel })).toHaveLength(1);
  });

  it("shows a file on its card while it goes up, then as attached", async () => {
    let release: (value: { error: unknown }) => void = () => {};
    uploadToSignedUrl.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    renderPage();
    openCategoryList();
    addTo("insuranceCard", en.IntakeEvidence.source.chooseDocument);

    await pick(insurancePdf());
    const uploading = await screen.findByTestId("category-upload-insuranceCard");
    expect(uploading).toHaveTextContent("policy.pdf");
    expect(uploading).toHaveTextContent(en.IntakeEvidence.uploadingFile);
    expect(screen.queryByTestId("category-document-insuranceCard")).not.toBeInTheDocument();

    await act(async () => release({ error: null }));
    await waitFor(() => expect(screen.getByTestId("category-document-insuranceCard")).toHaveTextContent("policy.pdf"));
    // Listed once: the attached row replaces the uploading one.
    expect(screen.queryByTestId("category-upload-insuranceCard")).not.toBeInTheDocument();
    expect(screen.getByTestId("category-count-insuranceCard")).toHaveTextContent("1");
    // It is on the card it was added to, and no other.
    expect(screen.queryByTestId("category-document-accidentReport")).not.toBeInTheDocument();
  });

  it("does not let another category start while a file is going up", async () => {
    let release: (value: { error: unknown }) => void = () => {};
    uploadToSignedUrl.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    renderPage();
    openCategoryList();
    addTo("insuranceCard", en.IntakeEvidence.source.chooseDocument);
    await pick(insurancePdf());
    await waitFor(() => expect(uploadToSignedUrl).toHaveBeenCalledTimes(1));

    // The file is going into Insurance; a new round now would change the
    // category under it.
    expect(categoryButton("accidentReport")).toBeDisabled();
    fireEvent.click(categoryButton("accidentReport"));
    expect(sheet()).not.toBeInTheDocument();
    // Cancel stays offered: it is how the upload is stopped (HP#127).
    expect(screen.getByRole("button", { name: en.IntakeEvidence.cancel })).toBeEnabled();

    await act(async () => release({ error: null }));
    await waitFor(() => expect(categoryButton("accidentReport")).toBeEnabled());
    expect(savedDocuments().map((doc) => doc.category)).toEqual(["insuranceCard"]);
  });

  it("shows a failed upload on its card, with a way to remove it", async () => {
    uploadToSignedUrl.mockResolvedValue({ error: { message: "storage unavailable" } });
    renderPage();
    openCategoryList();
    addTo("incidentPhotos", en.IntakeEvidence.source.choosePhotos);

    await pick(photo());
    const row = await screen.findByTestId("category-upload-incidentPhotos");
    await waitFor(() => expect(row).toHaveTextContent(en.IntakeEvidence.uploadFailed));
    // The Storage error is not the patient's business.
    expect(row).not.toHaveTextContent("storage unavailable");
    expect(savedDocuments()).toEqual([]);

    // It never reached Storage, so removing it asks nothing of the backend.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove crash.jpg" }));
    });
    expect(screen.queryByTestId("category-upload-incidentPhotos")).not.toBeInTheDocument();
    expect(deleteDocument).not.toHaveBeenCalled();
  });

  it("lets a failed file go when the patient moves on to another category", async () => {
    uploadToSignedUrl.mockResolvedValueOnce({ error: { message: "storage unavailable" } });
    renderPage();
    openCategoryList();
    addTo("incidentPhotos", en.IntakeEvidence.source.choosePhotos);
    await pick(photo());
    await screen.findByText(en.IntakeEvidence.uploadFailed);

    // It never reached Storage, so there is nothing to keep. It must not follow
    // the patient onto the next card, and above all must not be retried into
    // a category it was never meant for.
    addTo("insuranceCard", en.IntakeEvidence.source.chooseDocument);
    expect(screen.queryByText(en.IntakeEvidence.uploadFailed)).not.toBeInTheDocument();
    expect(screen.queryByTestId("category-upload-insuranceCard")).not.toBeInTheDocument();

    await pick(insurancePdf());
    await waitFor(() => expect(savedDocuments()).toHaveLength(1));
    expect(savedDocuments()[0].fileName).toBe("policy.pdf");
    expect(createDocumentUploadUrl.mock.calls.map(([payload]) => payload.fileName)).toEqual([
      "crash.jpg",
      "policy.pdf",
    ]);
  });
});

describe("saying nothing about video", () => {
  // Video cannot be uploaded, so no face of the upload step may offer it —
  // not the category, not the sheet, not a note, not an error.
  const mentionsVideo = (text: string) => /v[ií]de?o/i.test(text);
  const everythingOnScreen = () =>
    [
      document.body.textContent ?? "",
      ...Array.from(document.querySelectorAll("[aria-label]")).map((node) => node.getAttribute("aria-label") ?? ""),
    ].join(" ");

  afterEach(() => cleanup());

  for (const [messages, locale] of [
    [en, "en"],
    [es, "es"],
  ] as const) {
    it(`has no video wording in the ${locale} copy of the upload step`, () => {
      const values: string[] = [];
      const walk = (node: unknown) => {
        if (typeof node === "string") values.push(node);
        else if (node && typeof node === "object") Object.values(node).forEach(walk);
      };
      walk(messages.IntakeEvidence);
      expect(values.filter(mentionsVideo)).toEqual([]);
    });

    it(`shows none on any face of the upload step (${locale})`, () => {
      sessionStorage.clear();
      sessionStorage.setItem("intake_submissionId", "sub-1");
      renderPage(messages, locale);
      expect(mentionsVideo(everythingOnScreen())).toBe(false);

      fireEvent.click(screen.getByRole("button", { name: messages.IntakeEvidence.continue }));
      expect(screen.getByText(messages.IntakeEvidence.category.incidentPhotos)).toBeInTheDocument();
      expect(mentionsVideo(everythingOnScreen())).toBe(false);

      for (const category of ["incidentPhotos", "insuranceCard"] as const) {
        fireEvent.click(categoryButton(category, messages));
        expect(sourceButton(messages.IntakeEvidence.source.choosePhotos)).toHaveTextContent(
          messages.IntakeEvidence.source.choosePhotos
        );
        expect(mentionsVideo(everythingOnScreen())).toBe(false);
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      }
    });
  }
});

describe("what each category accepts", () => {
  beforeEach(() => {
    resetBackend();
    stubBrowserImages();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const reach = (category: keyof typeof en.IntakeEvidence.category, source: string) => {
    renderPage();
    openCategoryList();
    addTo(category, source);
  };

  it("takes a photo for the photos category, from the library or the camera", async () => {
    reach("incidentPhotos", en.IntakeEvidence.source.choosePhotos);
    await pick(photo());
    await waitFor(() => expect(savedDocuments()).toHaveLength(1));

    addTo("incidentPhotos", en.IntakeEvidence.source.takePhoto);
    await pick(photo("image.jpg"));
    await waitFor(() => expect(savedDocuments()).toHaveLength(2));

    expect(savedDocuments().every((doc) => doc.category === "incidentPhotos")).toBe(true);
    expect(createDocumentUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ category: "incidentPhotos", fileName: "crash.jpg" })
    );
  });

  it("takes a photo of a licence, and a PDF or a photo of an insurance card", async () => {
    reach("driversLicense", en.IntakeEvidence.source.choosePhotos);
    await pick(licencePhoto());
    await waitFor(() => expect(savedDocuments()).toHaveLength(1));

    addTo("insuranceCard", en.IntakeEvidence.source.chooseDocument);
    await pick(insurancePdf());
    await waitFor(() => expect(savedDocuments()).toHaveLength(2));

    expect(savedDocuments().map((doc) => doc.category)).toEqual(["driversLicense", "insuranceCard"]);
  });

  it("takes a PDF report", async () => {
    reach("accidentReport", en.IntakeEvidence.source.chooseDocument);
    await pick(reportPdf());
    await waitFor(() => expect(savedDocuments()).toHaveLength(1));
    expect(savedDocuments()[0].fileName).toBe("police-report.pdf");
  });

  it("keeps a second camera capture, which iOS also calls image.jpg", async () => {
    // Every photo the iOS camera hands back is named `image.jpg`. The working
    // list is keyed by name, so a second capture used to be dropped without a
    // word — the patient watched the shutter fire and nothing appeared.
    reach("driversLicense", en.IntakeEvidence.source.takePhoto);
    await pick(photo("image.jpg"));
    await waitFor(() => expect(savedDocuments()).toHaveLength(1));

    addTo("driversLicense", en.IntakeEvidence.source.takePhoto);
    await pick(photo("image.jpg"));
    await waitFor(() => expect(savedDocuments()).toHaveLength(2));

    // Two objects, and two names the patient can tell apart on the card.
    expect(savedDocuments().map((doc) => doc.fileName)).toEqual(["image.jpg", "image (2).jpg"]);
    expect(new Set(savedDocuments().map((doc) => doc.storagePath)).size).toBe(2);
    expect(savedDocuments().every((doc) => doc.category === "driversLicense")).toBe(true);
    expect(screen.getAllByTestId("category-document-driversLicense")).toHaveLength(2);
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(2);
  });

  it("does not rename a file to avoid a name in another category", async () => {
    reach("driversLicense", en.IntakeEvidence.source.takePhoto);
    await pick(photo("image.jpg"));
    await waitFor(() => expect(savedDocuments()).toHaveLength(1));

    addTo("insuranceCard", en.IntakeEvidence.source.takePhoto);
    await pick(photo("image.jpg"));
    await waitFor(() => expect(savedDocuments()).toHaveLength(2));

    expect(savedDocuments().map((doc) => doc.fileName)).toEqual(["image.jpg", "image.jpg"]);
  });

  it("keeps two same-named files picked together apart", async () => {
    reach("driversLicense", en.IntakeEvidence.source.choosePhotos);
    await pick(photo("image.jpg"), photo("image.jpg"));
    await waitFor(() => expect(savedDocuments()).toHaveLength(2));

    expect(savedDocuments().map((doc) => doc.fileName)).toEqual(["image.jpg", "image (2).jpg"]);
  });

  it("refuses a video that arrives anyway, as a file the category does not take", async () => {
    // The picker filters videos out; a file browser set to "all files" can
    // still hand one over. It must not fail silently or pretend the file went
    // up — and the refusal asks for a photo rather than talking about video.
    reach("incidentPhotos", en.IntakeEvidence.source.choosePhotos);
    await pick(clip());

    expect(await screen.findByText(en.IntakeEvidence.rejectedTypeImage)).toBeInTheDocument();
    expect(uploadToSignedUrl).not.toHaveBeenCalled();
    expect(createDocumentUploadUrl).not.toHaveBeenCalled();
    expect(savedDocuments()).toEqual([]);
  });

  it("uploads the photo and refuses the video when both are picked together", async () => {
    reach("incidentPhotos", en.IntakeEvidence.source.choosePhotos);
    await pick(photo(), clip());

    await waitFor(() => expect(savedDocuments()).toHaveLength(1));
    expect(savedDocuments()[0].fileName).toBe("crash.jpg");
    // The refused file is never sent, and stays on the card until removed.
    expect(createDocumentUploadUrl).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("category-upload-incidentPhotos")).toHaveTextContent(en.IntakeEvidence.rejectedTypeImage);

    fireEvent.click(screen.getByRole("button", { name: "Remove dashcam.mp4" }));
    expect(screen.queryByTestId("category-upload-incidentPhotos")).not.toBeInTheDocument();
    expect(savedDocuments()).toHaveLength(1);
  });

  it("refuses a file over the size limit, and says how big it is", async () => {
    reach("accidentReport", en.IntakeEvidence.source.chooseDocument);
    const big = reportPdf();
    Object.defineProperty(big, "size", { value: 31_400_000 });
    await pick(big);

    expect(
      await screen.findByText(en.IntakeEvidence.fileTooLarge.replace("{size}", "31.4 MB").replace("{max}", "25 MB"))
    ).toBeInTheDocument();
    expect(uploadToSignedUrl).not.toHaveBeenCalled();
  });

  it("refuses a document in the photos category, and says what it wants instead", async () => {
    reach("incidentPhotos", en.IntakeEvidence.source.choosePhotos);
    await pick(insurancePdf());

    expect(await screen.findByText(en.IntakeEvidence.rejectedTypeImage)).toBeInTheDocument();
    expect(uploadToSignedUrl).not.toHaveBeenCalled();
    expect(savedDocuments()).toEqual([]);
  });

  it("names both kinds when the category takes both", async () => {
    reach("accidentReport", en.IntakeEvidence.source.chooseDocument);
    await pick(new File([new Uint8Array(8)], "notes.docx", { type: "application/msword" }));

    expect(await screen.findByText(en.IntakeEvidence.rejectedTypeImageOrPdf)).toBeInTheDocument();
    expect(savedDocuments()).toEqual([]);
  });

  it("says it in Spanish too", async () => {
    renderPage(es, "es");
    fireEvent.click(screen.getByRole("button", { name: es.IntakeEvidence.continue }));
    fireEvent.click(categoryButton("incidentPhotos", es));
    chooseSource(es.IntakeEvidence.source.choosePhotos);
    await pick(clip());

    expect(await screen.findByText(es.IntakeEvidence.rejectedTypeImage)).toBeInTheDocument();
  });
});

describe("what the category list shows", () => {
  beforeEach(() => {
    resetBackend();
    stubBrowserImages();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("names the documents that are attached to each category", async () => {
    renderPage();
    openCategoryList();
    addTo("insuranceCard", en.IntakeEvidence.source.chooseDocument);
    await pick(insurancePdf());
    await waitFor(() => expect(savedDocuments()).toHaveLength(1));

    const rows = screen.getAllByTestId("category-document-insuranceCard");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("policy.pdf");
    expect(screen.getByTestId("category-count-insuranceCard")).toHaveTextContent("1");
    // Categories with nothing attached say nothing.
    expect(screen.queryByTestId("category-document-accidentReport")).not.toBeInTheDocument();
  });

  it("still shows them after the screen is left and opened again", async () => {
    const first = renderPage();
    openCategoryList();
    addTo("accidentReport", en.IntakeEvidence.source.chooseDocument);
    await pick(reportPdf());
    await waitFor(() => expect(savedDocuments()).toHaveLength(1));
    first.unmount();

    renderPage();
    openCategoryList();
    await waitFor(() =>
      expect(screen.getByTestId("category-document-accidentReport")).toHaveTextContent("police-report.pdf")
    );
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("deletes a document from its card once the backend confirms it", async () => {
    renderPage();
    openCategoryList();
    addTo("accidentReport", en.IntakeEvidence.source.chooseDocument);
    await pick(reportPdf());
    await waitFor(() => expect(savedDocuments()).toHaveLength(1));
    const storagePath = savedDocuments()[0].storagePath;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete police-report.pdf" }));
    });
    await waitFor(() => expect(savedDocuments()).toEqual([]));
    expect(deleteDocument).toHaveBeenCalledWith({ submissionId: "sub-1", storagePath });
    expect(screen.queryByTestId("category-document-accidentReport")).not.toBeInTheDocument();
    expect(screen.queryByTestId("category-count-accidentReport")).not.toBeInTheDocument();
    // It does not come back as a file still going up, and nothing is held up.
    expect(screen.queryByTestId("category-upload-accidentReport")).not.toBeInTheDocument();
    expect(categoryButton("insuranceCard")).toBeEnabled();
    // Nothing is left attached, so there is nothing to continue with.
    expect(screen.queryByRole("button", { name: en.IntakeEvidence.continueAfterSelect })).not.toBeInTheDocument();
  });

  it("deletes a document attached on an earlier visit", async () => {
    sessionStorage.setItem(
      "intake_documents",
      JSON.stringify([
        {
          fileName: "policy.pdf",
          storagePath: "sub-1/insuranceCard/policy-1.pdf",
          mimeType: "application/pdf",
          fileSize: 96,
          category: "insuranceCard",
        },
      ])
    );
    renderPage();
    openCategoryList();
    await screen.findByTestId("category-document-insuranceCard");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete policy.pdf" }));
    });
    await waitFor(() => expect(savedDocuments()).toEqual([]));
    expect(deleteDocument).toHaveBeenCalledWith({
      submissionId: "sub-1",
      storagePath: "sub-1/insuranceCard/policy-1.pdf",
    });
  });

  it("keeps a document the backend would not delete, and says so", async () => {
    deleteDocument.mockRejectedValue(new Error("Request failed with status 500"));
    renderPage();
    openCategoryList();
    addTo("accidentReport", en.IntakeEvidence.source.chooseDocument);
    await pick(reportPdf());
    await waitFor(() => expect(savedDocuments()).toHaveLength(1));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete police-report.pdf" }));
    });

    const row = screen.getByTestId("category-document-accidentReport");
    await waitFor(() => expect(row).toHaveTextContent(en.IntakeEvidence.deleteFailed));
    expect(row).not.toHaveTextContent("500");
    // Still attached everywhere, and it can be tried again.
    expect(savedDocuments()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Delete police-report.pdf" })).toBeInTheDocument();
  });

  it("counts only this submission's documents", async () => {
    // A record left behind by an earlier intake in the same tab: the backend
    // rejects a foreign object key at submit, so it is not this case's.
    sessionStorage.setItem(
      "intake_documents",
      JSON.stringify([
        {
          fileName: "someone-else.pdf",
          storagePath: "sub-0/accidentReport/someone-else-1.pdf",
          mimeType: "application/pdf",
          fileSize: 10,
          category: "accidentReport",
        },
      ])
    );

    renderPage();
    openCategoryList();
    await waitFor(() => expect(screen.getByRole("button", { name: en.IntakeEvidence.cancel })).toBeInTheDocument());
    expect(screen.queryByTestId("category-document-accidentReport")).not.toBeInTheDocument();
    expect(screen.queryByTestId("category-count-accidentReport")).not.toBeInTheDocument();
  });
});

describe("the thumbnail kept for a photo", () => {
  // The bucket cannot be read back, so the only picture of an uploaded photo
  // is the small one made from the picked file as it is recorded. These
  // browsers decode slowly on purpose, so the patient can act first.
  const previews = () =>
    JSON.parse(sessionStorage.getItem("intake_document_previews") ?? "{}") as Record<string, string>;

  beforeEach(() => {
    resetBackend();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:preview", revokeObjectURL: () => {} }));
    vi.stubGlobal(
      "Image",
      class {
        width = 400;
        height = 300;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          setTimeout(() => this.onload?.(), 200);
        }
      }
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: () => {},
    } as unknown as CanvasRenderingContext2D);
    // no webp encoder: the upload falls back to the original bytes
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(null));
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/webp;base64,thumb");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("is kept even when another category is opened straight after the upload", async () => {
    renderPage();
    openCategoryList();
    addTo("incidentPhotos", en.IntakeEvidence.source.choosePhotos);
    await pick(photo());
    await waitFor(() => expect(savedDocuments()).toHaveLength(1));
    const storagePath = savedDocuments()[0].storagePath;
    expect(previews()[storagePath]).toBeUndefined();

    // A new round clears the working list while the thumbnail is still being
    // made; the thumbnail belongs to the record, not to that list.
    addTo("insuranceCard", en.IntakeEvidence.source.chooseDocument);

    await waitFor(() => expect(previews()[storagePath]).toBe("data:image/webp;base64,thumb"));
  });

  it("is not kept for a photo deleted before it was ready", async () => {
    renderPage();
    openCategoryList();
    addTo("incidentPhotos", en.IntakeEvidence.source.choosePhotos);
    await pick(photo());
    await waitFor(() => expect(savedDocuments()).toHaveLength(1));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete crash.jpg" }));
    });
    await waitFor(() => expect(savedDocuments()).toEqual([]));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    expect(previews()).toEqual({});
  });
});

describe("arriving from the case summary", () => {
  beforeEach(() => {
    resetBackend();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:preview", revokeObjectURL: () => {} }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens straight at the categories, and goes back where it came from", async () => {
    manageToken = "abc123";
    renderPage();

    await waitFor(() => expect(screen.getByText(en.IntakeEvidence.categoryHeading)).toBeInTheDocument());
    // The intro belongs to the flow, not to editing documents.
    expect(screen.queryByText(en.IntakeEvidence.subheading)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: en.IntakeEvidence.cancel }));
    expect(push).toHaveBeenCalledWith("/en/intake/review");
  });

  it("starts at the intro when the patient is walking the flow", async () => {
    manageToken = null;
    renderPage();
    await waitFor(() => expect(screen.getByText(en.IntakeEvidence.subheading)).toBeInTheDocument());
    expect(screen.queryByText(en.IntakeEvidence.categoryHeading)).not.toBeInTheDocument();
  });
});

describe("when Continue is offered", () => {
  // Continue leads to the case summary, so it is there only once something is
  // actually attached — never for a file still going up, and never for one
  // that failed.
  beforeEach(() => {
    resetBackend();
    stubBrowserImages();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const continueButton = () => screen.queryByRole("button", { name: en.IntakeEvidence.continueAfterSelect });

  it("offers no Continue on the category list until something is attached", () => {
    renderPage();
    openCategoryList();

    expect(continueButton()).not.toBeInTheDocument();
    // The way back is still there.
    expect(screen.getByRole("button", { name: en.IntakeEvidence.cancel })).toBeInTheDocument();
  });

  it("offers Continue once a photo has uploaded, and it goes to the case summary", async () => {
    renderPage();
    openCategoryList();
    addTo("incidentPhotos", en.IntakeEvidence.source.choosePhotos);
    expect(continueButton()).not.toBeInTheDocument();

    await pick(photo());
    await waitFor(() => expect(savedDocuments()).toHaveLength(1));
    await waitFor(() => expect(continueButton()).toBeInTheDocument());
    // The uploaded state: the photo is listed on its card.
    expect(screen.getByTestId("category-document-incidentPhotos")).toHaveTextContent("crash.jpg");
    expect(screen.getByTestId("category-count-incidentPhotos")).toHaveTextContent("1");

    fireEvent.click(continueButton()!);
    expect(push).toHaveBeenCalledWith("/en/intake/review");
    expect(savedDocuments()).toHaveLength(1);
  });

  it("keeps Continue away while the upload is still running", async () => {
    let release: (value: { error: unknown }) => void = () => {};
    uploadToSignedUrl.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    renderPage();
    openCategoryList();
    addTo("incidentPhotos", en.IntakeEvidence.source.choosePhotos);

    await pick(photo());
    await waitFor(() => expect(uploadToSignedUrl).toHaveBeenCalledTimes(1));
    expect(continueButton()).not.toBeInTheDocument();

    await act(async () => release({ error: null }));
    await waitFor(() => expect(continueButton()).toBeInTheDocument());
  });

  it("takes Continue away again while a second photo is going up", async () => {
    renderPage();
    openCategoryList();
    addTo("incidentPhotos", en.IntakeEvidence.source.choosePhotos);
    await pick(photo("first.jpg"));
    await waitFor(() => expect(continueButton()).toBeInTheDocument());

    let release: (value: { error: unknown }) => void = () => {};
    uploadToSignedUrl.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    addTo("incidentPhotos", en.IntakeEvidence.source.choosePhotos);
    await pick(photo("second.jpg"));
    await waitFor(() => expect(uploadToSignedUrl).toHaveBeenCalledTimes(2));
    // Something is attached, but the step is not finished while a file is still
    // on its way, so Continue does not claim otherwise.
    expect(continueButton()).not.toBeInTheDocument();

    await act(async () => release({ error: null }));
    await waitFor(() => expect(continueButton()).toBeInTheDocument());
    expect(savedDocuments()).toHaveLength(2);
  });

  it("does not unlock Continue when the upload fails", async () => {
    uploadToSignedUrl.mockResolvedValue({ error: { message: "storage unavailable" } });
    renderPage();
    openCategoryList();
    addTo("incidentPhotos", en.IntakeEvidence.source.choosePhotos);

    await pick(photo());
    await waitFor(() => expect(uploadToSignedUrl).toHaveBeenCalledTimes(1));
    await act(async () => {});

    expect(savedDocuments()).toEqual([]);
    expect(continueButton()).not.toBeInTheDocument();
    // Every category can still be added to.
    expect(categoryButton("incidentPhotos")).toBeEnabled();
    expect(categoryButton("accidentReport")).toBeEnabled();
  });

  it("does not hold Continue back for a failed file when something else is attached", async () => {
    renderPage();
    openCategoryList();
    addTo("insuranceCard", en.IntakeEvidence.source.chooseDocument);
    await pick(insurancePdf());
    await waitFor(() => expect(continueButton()).toBeInTheDocument());

    uploadToSignedUrl.mockResolvedValue({ error: { message: "storage unavailable" } });
    addTo("incidentPhotos", en.IntakeEvidence.source.choosePhotos);
    await pick(photo());
    await screen.findByText(en.IntakeEvidence.uploadFailed);

    // The failed photo is not part of the case and says so on its card; what
    // did attach can go forward.
    fireEvent.click(continueButton()!);
    expect(push).toHaveBeenCalledWith("/en/intake/review");
    expect(savedDocuments().map((doc) => doc.fileName)).toEqual(["policy.pdf"]);
  });

  it("does not duplicate a document when its category is opened again", async () => {
    renderPage();
    openCategoryList();
    addTo("incidentPhotos", en.IntakeEvidence.source.choosePhotos);
    await pick(photo());
    await waitFor(() => expect(savedDocuments()).toHaveLength(1));

    // Opening Photos again and closing the picker empty-handed leaves that one
    // photo — listed once, recorded once.
    addTo("incidentPhotos", en.IntakeEvidence.source.choosePhotos);
    await act(async () => {
      fireEvent.focus(window);
    });
    await act(async () => {});

    expect(savedDocuments()).toHaveLength(1);
    expect(screen.getAllByTestId("category-document-incidentPhotos")).toHaveLength(1);
    expect(screen.getAllByTitle("crash.jpg")).toHaveLength(1);
    expect(screen.getByTestId("category-count-incidentPhotos")).toHaveTextContent("1");
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(1);
  });
});
