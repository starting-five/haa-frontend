import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en.json";

// Choosing files in the picker is the patient's upload gesture. These tests
// pin the contract behind that: a batch goes up once, never twice, a failure
// is not retried behind the patient's back, a refused file does not hold the
// others back, and a later round with the same file name is a fresh upload
// rather than a duplicate or a silent skip.

const realLocation = window.location;
Object.defineProperty(window, "location", {
  configurable: true,
  writable: true,
  value: {
    href: realLocation.href,
    origin: realLocation.origin,
    protocol: realLocation.protocol,
    host: realLocation.host,
    hostname: realLocation.hostname,
    port: realLocation.port,
    pathname: realLocation.pathname,
    search: realLocation.search,
    hash: realLocation.hash,
  },
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/intake/evidence",
  useSearchParams: () => new URLSearchParams(""),
}));

// the header this page renders builds a Supabase client and watches auth state
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);

vi.mock("@/hooks/use-require-session-key", () => ({ useRequireSessionKey: () => {} }));
vi.mock("@/services/intake", () => ({ createDocumentUploadUrl: vi.fn(), deleteDocument: vi.fn() }));

interface PickedFile {
  name: string;
  errors: { code: string; message: string }[];
  // The real hook stamps the object key the upload route minted onto the file
  // once it has uploaded, and the page will not record a document without one.
  // The mock left it off, which is how a page that invented keys for itself
  // passed here for so long.
  storagePath: string;
  type: string;
  size: number;
}

interface UploadState {
  files: PickedFile[];
  loading: boolean;
  successes: string[];
  errors: { name: string; message: string }[];
}

const onUpload = vi.fn();
const reset = vi.fn();
let uploadState: UploadState = { files: [], loading: false, successes: [], errors: [] };

// The real hook rebuilds onUpload whenever its state changes, and StrictMode
// runs effects twice in development, so the page must cope with the callback
// changing identity between renders. A fresh wrapper per render models that.
vi.mock("@/hooks/use-supabase-upload", () => ({
  useSupabaseUpload: () => ({
    ...uploadState,
    onUpload: () => onUpload(),
    reset,
    cancel: vi.fn(),
    progress: {},
    inputRef: { current: null },
    setFiles: vi.fn(),
    setSuccesses: vi.fn(),
    removeFile: vi.fn(),
    open: vi.fn(),
    isSuccess: false,
    maxFileSize: 25_000_000,
    maxFiles: 8,
    getRootProps: () => ({}),
    getInputProps: () => ({}),
  }),
}));

import EvidencePage from "../page";

const renderPage = () =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
    >
      <EvidencePage />
    </NextIntlClientProvider>
  );

const rerenderPage = (view: ReturnType<typeof renderPage>) =>
  view.rerender(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
    >
      <EvidencePage />
    </NextIntlClientProvider>
  );

// Hand the mocked hook a finished round, then let the page's effects settle.
const settleRound = async (view: ReturnType<typeof renderPage>, successes: string[]) => {
  await act(async () => {
    uploadState = { ...uploadState, loading: false, successes };
    rerenderPage(view);
  });
};

const startNewRound = async (view: ReturnType<typeof renderPage>) => {
  await act(async () => {
    uploadState = { files: [], loading: false, successes: [], errors: [] };
    rerenderPage(view);
  });
};

// Walk the page to the picker the way a patient does.
const reachUploadStep = async () => {
  fireEvent.click(screen.getByRole("button", { name: messages.IntakeEvidence.continue }));
  fireEvent.click(screen.getByRole("button", { name: messages.IntakeEvidence.category.accidentReport }));
  fireEvent.click(screen.getByRole("button", { name: messages.IntakeEvidence.source.chooseDocument }));
};

let pickCounter = 0;
const pick = (names: string[]) => {
  uploadState = {
    ...uploadState,
    files: names.map((name) => {
      pickCounter += 1;
      const dot = name.lastIndexOf(".");
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const extension = dot > 0 ? name.slice(dot) : "";
      return {
        name,
        errors: [],
        // unique per upload, the way the backend mints it
        storagePath: `sub-1/uploads/${stem}-${pickCounter.toString(16).padStart(8, "0")}${extension}`,
        type: extension === ".pdf" ? "application/pdf" : "image/jpeg",
        size: 1024 * pickCounter,
      };
    }),
  };
};

describe("evidence upload", () => {
  beforeEach(() => {
    sessionStorage.setItem("intake_submissionId", "sub-1");
    uploadState = { files: [], loading: false, successes: [], errors: [] };
    pickCounter = 0;
    onUpload.mockReset();
    reset.mockReset();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("uploads a picked batch once, without a second tap", async () => {
    const view = renderPage();
    await reachUploadStep();
    expect(onUpload).not.toHaveBeenCalled();

    pick(["report.pdf"]);
    view.rerender(
      <NextIntlClientProvider
        locale="en"
        messages={messages}
      >
        <EvidencePage />
      </NextIntlClientProvider>
    );
    expect(onUpload).toHaveBeenCalledTimes(1);

    // The hook has not flipped to loading yet; a render in that window is the
    // easiest way to send a batch twice.
    view.rerender(
      <NextIntlClientProvider
        locale="en"
        messages={messages}
      >
        <EvidencePage />
      </NextIntlClientProvider>
    );
    expect(onUpload).toHaveBeenCalledTimes(1);

    // Re-renders while the same batch is in flight or settled must not resend it.
    uploadState = { ...uploadState, loading: true };
    view.rerender(
      <NextIntlClientProvider
        locale="en"
        messages={messages}
      >
        <EvidencePage />
      </NextIntlClientProvider>
    );
    uploadState = { ...uploadState, loading: false, successes: ["report.pdf"] };
    view.rerender(
      <NextIntlClientProvider
        locale="en"
        messages={messages}
      >
        <EvidencePage />
      </NextIntlClientProvider>
    );
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it("does not retry a failed file on its own", async () => {
    const view = renderPage();
    await reachUploadStep();
    pick(["report.pdf"]);
    view.rerender(
      <NextIntlClientProvider
        locale="en"
        messages={messages}
      >
        <EvidencePage />
      </NextIntlClientProvider>
    );
    expect(onUpload).toHaveBeenCalledTimes(1);

    uploadState = { ...uploadState, errors: [{ name: "report.pdf", message: "network" }] };
    view.rerender(
      <NextIntlClientProvider
        locale="en"
        messages={messages}
      >
        <EvidencePage />
      </NextIntlClientProvider>
    );
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it("treats the same file name in a later round as a new upload", async () => {
    const view = renderPage();
    await reachUploadStep();
    pick(["photo.jpg"]);
    view.rerender(
      <NextIntlClientProvider
        locale="en"
        messages={messages}
      >
        <EvidencePage />
      </NextIntlClientProvider>
    );
    uploadState = { ...uploadState, successes: ["photo.jpg"] };
    view.rerender(
      <NextIntlClientProvider
        locale="en"
        messages={messages}
      >
        <EvidencePage />
      </NextIntlClientProvider>
    );
    expect(onUpload).toHaveBeenCalledTimes(1);

    // A new round starts empty, then the picker hands over a file with the same name.
    await act(async () => {
      uploadState = { files: [], loading: false, successes: [], errors: [] };
      view.rerender(
        <NextIntlClientProvider
          locale="en"
          messages={messages}
        >
          <EvidencePage />
        </NextIntlClientProvider>
      );
    });
    pick(["photo.jpg"]);
    view.rerender(
      <NextIntlClientProvider
        locale="en"
        messages={messages}
      >
        <EvidencePage />
      </NextIntlClientProvider>
    );
    expect(onUpload).toHaveBeenCalledTimes(2);
  });

  it("sends the files the category took even when one of them was refused", async () => {
    const view = renderPage();
    await reachUploadStep();
    pick(["report.pdf", "clip.mov"]);
    uploadState = {
      ...uploadState,
      files: uploadState.files.map((file) =>
        file.name === "clip.mov" ? { ...file, errors: [{ code: "file-invalid-type", message: "refused" }] } : file
      ),
    };
    rerenderPage(view);

    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("refused");
  });

  it("records an upload on its category card as soon as it lands", async () => {
    const view = renderPage();
    await reachUploadStep();
    pick(["report.pdf"]);
    rerenderPage(view);
    await settleRound(view, ["report.pdf"]);

    // There is no upload screen to leave: the list never went away.
    expect(screen.getByText(messages.IntakeEvidence.categoryHeading)).toBeInTheDocument();

    // The document is recorded in patient-flow state, under its category.
    const saved = JSON.parse(sessionStorage.getItem("intake_documents") ?? "[]");
    expect(saved).toHaveLength(1);
    expect(saved[0].category).toBe("accidentReport");

    // And the category is marked as done, with the file on its card.
    expect(screen.getByTestId("category-count-accidentReport")).toHaveTextContent("1");
    expect(screen.getByTestId("category-document-accidentReport")).toHaveTextContent("report.pdf");
    expect(screen.queryByTestId("category-upload-accidentReport")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.IntakeEvidence.continueAfterSelect })).toBeInTheDocument();
  });

  it("keeps earlier documents when a second category is added", async () => {
    const view = renderPage();

    // First category.
    await reachUploadStep();
    pick(["report.pdf"]);
    rerenderPage(view);
    await settleRound(view, ["report.pdf"]);

    // Second category, straight from the list.
    await startNewRound(view);
    fireEvent.click(screen.getByRole("button", { name: messages.IntakeEvidence.category.driversLicense }));
    fireEvent.click(screen.getByRole("button", { name: messages.IntakeEvidence.source.chooseDocument }));
    pick(["license.jpg"]);
    rerenderPage(view);
    await settleRound(view, ["license.jpg"]);

    // Both documents survive, each under its own category — nothing lost.
    const saved = JSON.parse(sessionStorage.getItem("intake_documents") ?? "[]");
    expect(saved).toHaveLength(2);
    expect(saved.map((doc: { category: string }) => doc.category).sort()).toEqual(["accidentReport", "driversLicense"]);
    // Distinct object keys, so no duplicate Storage object.
    expect(new Set(saved.map((doc: { storagePath: string }) => doc.storagePath)).size).toBe(2);
    expect(screen.getByTestId("category-count-accidentReport")).toHaveTextContent("1");
    expect(screen.getByTestId("category-count-driversLicense")).toHaveTextContent("1");
  });
});
