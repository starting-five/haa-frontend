import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import en from "../../../../../../../messages/en.json";
import es from "../../../../../../../messages/es.json";

// The lawyer review page is a security boundary. It renders what the backend's
// POST /portal/review-case returns for the link's token and nothing else: it no
// longer reads patient tables itself, and the backend sends nothing
// identifying until the lawyer has accepted.
//
// These render the real page against a stubbed backend and pin:
// - what the lawyer sees in each state (pending, accepted, rejected, expired):
//   the case, its date and place and its files before acceptance, never the
//   patient's identity or the files' own names,
// - that the case the backend is asked about comes from the HttpOnly cookie and
//   never from the URL,
// - that an edited or old cookie reaches no backend at all,
// - that a masked answer carrying a patient block, a file name or a URL is
//   refused, not rendered, and that files open only through the app's own route,
// - and that no Supabase client is ever created here.

const CLAIMANT = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const SUBMISSION = "9b2e7c41-5d6a-4f38-8e1b-2c7d9a0f3e55";
const TOKEN = "qH3kz1YtV0cP7mR2sB8nW4dL6fJ9xA5e";
const DEADLINE = "2099-10-13T12:00:00.000Z";

const state = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  locale: "en" as "en" | "es",
  refresh: (() => undefined) as () => void,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name) } : undefined),
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
  useRouter: () => ({ refresh: () => state.refresh(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("next-intl/server", async () => {
  const messages = {
    en: (await import("../../../../../../../messages/en.json")).default,
    es: (await import("../../../../../../../messages/es.json")).default,
  };
  const { createTranslator: create } = await import("next-intl");
  return {
    getTranslations: async (namespace: string) =>
      create({ locale: state.locale, messages: messages[state.locale], namespace: namespace as never }),
  };
});

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span
      data-testid="next-image"
      data-src={src}
      aria-label={alt}
    />
  ),
}));

vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);

const supabaseCreateClient = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({ createClient: supabaseCreateClient }));

import LawyerReviewPage from "../page";

const originalEnv = { ...process.env };
const fetchMock = vi.fn();

const cookieOf = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const reviewCookie = cookieOf({ claimantUserId: CLAIMANT, submissionId: SUBMISSION, token: TOKEN });

const caseFacts = {
  incidentType: "car",
  role: "driver",
  injuries: "headNeck,back",
  story: "A pickup ran the red light and hit my driver side. Call me at •••.",
  language: "es",
  companionRelations: ["passenger"],
  documentCounts: [
    { category: "accidentReport", count: 1 },
    { category: "driversLicense", count: 1 },
    { category: "incidentPhotos", count: 1 },
    { category: "insuranceCard", count: 1 },
  ],
};

const incident = { date: "2025-11-17", location: "Lamar Blvd & W 38th St, Austin, TX" };

const DOC = {
  license: "0d9f6a2e-1c3b-4e5d-8f70-9a1b2c3d4e5f",
  insurance: "1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b",
  heic: "2f3a4b5c-6d7e-4f80-9a1b-2c3d4e5f6a7b",
  missing: "3a4b5c6d-7e8f-4091-8a2b-3c4d5e6f7a8b",
};

// The case's files as the backend lists them after acceptance. The last is a
// row whose file Storage does not hold, so it cannot be opened.
const files = [
  {
    id: DOC.license,
    category: "driversLicense",
    fileName: "license.jpg",
    mimeType: "image/jpeg",
    fileSize: 204800,
    kind: "image",
    available: true,
  },
  {
    id: DOC.insurance,
    category: "insuranceCard",
    fileName: "insurance-card.pdf",
    mimeType: "application/pdf",
    fileSize: 51200,
    kind: "pdf",
    available: true,
  },
  {
    id: DOC.heic,
    category: "incidentPhotos",
    fileName: "IMG_2232.HEIC",
    mimeType: "image/heic",
    fileSize: 3145728,
    kind: "file",
    available: true,
  },
  {
    id: DOC.missing,
    category: "accidentReport",
    fileName: "report-missing.pdf",
    mimeType: "application/pdf",
    fileSize: 1000,
    kind: "file",
    available: false,
  },
];

// Before acceptance the same files arrive without their own names.
const unnamedFiles = files.map((file) => ({ ...file, fileName: null }));

const masked = (
  status: "pending" | "accepted" | "rejected" | "expired" = "pending",
  canDecide = status === "pending"
) => ({
  ok: true,
  access: "masked",
  review: { status, canDecide, responseDeadline: DEADLINE },
  caseFacts,
  patient: null,
  incident,
  companions: null,
  // Files are listed only while the link may open them.
  documents: status === "pending" ? unnamedFiles : null,
});

const full = {
  ok: true,
  access: "full",
  review: { status: "accepted", canDecide: false, responseDeadline: DEADLINE },
  caseFacts: { ...caseFacts, story: "A pickup ran the red light and hit my driver side. Call me at (512) 555-0147." },
  patient: {
    firstName: "Marisol",
    lastName: "Quintanilla",
    mobile: "+15125550147",
    email: "marisol.q@example.com",
    residence: "4417 Avenue F, Austin, TX 78751",
    treatmentArea: "Round Rock, TX",
  },
  incident,
  companions: [
    {
      firstName: "Teodoro",
      lastName: "Balderrama",
      relation: "passenger",
      cellNumber: "+15125550198",
      email: "teo@example.com",
    },
  ],
  documents: files,
};

// Who the patient is and how to reach them, and what the files are called:
// none of it may reach the page before acceptance. The accident's date and
// place are not here — a pending lawyer is shown them.
const PROTECTED = [
  "Marisol",
  "Quintanilla",
  "555-0147",
  "marisol.q@example.com",
  "Avenue F",
  "Round Rock",
  "Teodoro",
  "license.jpg",
  "insurance-card.pdf",
  "IMG_2232",
  "report-missing",
  "/storage/v1/",
];

const documentRoute = (id: string) => `/api/review/documents/${id}`;

const backendAnswers = (status: number, body: unknown) =>
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(body), { status }));

const renderPage = async (search: Record<string, string> = {}, userId = CLAIMANT) => {
  const ui = await LawyerReviewPage({
    params: Promise.resolve({ locale: state.locale, userId }),
    searchParams: Promise.resolve(search),
  });
  return render(
    <NextIntlClientProvider
      locale={state.locale}
      messages={state.locale === "en" ? en : es}
    >
      {ui as ReactNode}
    </NextIntlClientProvider>
  );
};

const redirectOf = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    const match = String((error as Error).message).match(/^NEXT_REDIRECT:(.*)$/);
    if (match) return match[1];
    throw error;
  }
  return null;
};

const reviewCaseCalls = () => fetchMock.mock.calls.filter((args) => String(args[0]).endsWith("/portal/review-case"));
const openTab = (tab: "summary" | "story" | "documents") =>
  fireEvent.click(
    screen.getByRole("tab", {
      name: (state.locale === "en" ? en : es).LawyerReview[
        `tab${tab[0]!.toUpperCase()}${tab.slice(1)}` as "tabSummary" | "tabStory" | "tabDocuments"
      ],
    })
  );

beforeEach(() => {
  fetchMock.mockReset();
  supabaseCreateClient.mockReset();
  state.cookies.clear();
  state.cookies.set("haa_review_access", reviewCookie);
  state.locale = "en";
  state.refresh = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  process.env.API_URL = "http://backend:4000";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-that-must-not-be-used";
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("lawyer review page, before acceptance", () => {
  it("asks the backend for the cookie's case with the cookie's token, and nothing else", async () => {
    backendAnswers(200, masked());
    await renderPage();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://backend:4000/portal/review-case");
    expect(init?.method).toBe("POST");
    expect(init?.cache).toBe("no-store");
    expect(JSON.parse(String(init?.body))).toEqual({
      claimantUserId: CLAIMANT,
      submissionId: SUBMISSION,
      token: TOKEN,
    });
    expect(supabaseCreateClient).not.toHaveBeenCalled();
  });

  it("shows the case, when and where it happened, and its files — and withholds the patient", async () => {
    backendAnswers(200, masked());
    const { container } = await renderPage();

    expect(container.textContent).not.toContain(CLAIMANT);
    // Name, mobile, email, residence and treatment area: nothing else is withheld.
    expect(screen.getAllByText(en.LawyerReview.availableAfterAcceptance)).toHaveLength(5);
    expect(container.textContent).toContain("Nov 17, 2025");
    expect(container.textContent).toContain("Lamar Blvd & W 38th St, Austin, TX");
    expect(container.textContent).toContain(en.Case.incidentTypes.car);
    expect(container.textContent).toContain(en.Case.roles.driver);
    expect(container.textContent).toContain(`${en.IntakeInjury.headNeck} · ${en.IntakeInjury.back}`);
    expect(container.textContent).toContain(en.LawyerReview.languages.es);
    expect(container.textContent).toContain(en.IntakeWhoWasWithYou.relationPassenger);
    expect(container.textContent).toContain(en.LawyerReview.companionMasked);
    for (const value of PROTECTED) expect(container.innerHTML).not.toContain(value);

    openTab("story");
    expect(container.textContent).toContain("Call me at •••.");
    expect(container.textContent).not.toContain(en.LawyerReview.storyMasked);

    openTab("documents");
    expect(container.textContent).toContain(`${en.IntakeEvidence.category.driversLicense} (1)`);
    expect(container.textContent).not.toContain(en.LawyerReview.documentsClosed);
  });

  it("opens every file through the app's own route, numbered rather than named", async () => {
    backendAnswers(200, masked());
    const { container } = await renderPage();
    openTab("documents");

    // The photo is drawn from the route, never from Storage.
    const photo = container.querySelector(`[data-src="${documentRoute(DOC.license)}"]`);
    expect(photo).not.toBeNull();
    expect(photo).toHaveAttribute("aria-label", "Photo 1");

    const pdf = screen.getByRole("link", { name: `${en.LawyerReview.viewDocument}: PDF 1` });
    expect(pdf).toHaveAttribute("href", documentRoute(DOC.insurance));
    expect(pdf).toHaveAttribute("target", "_blank");
    expect(pdf).toHaveAttribute("rel", "noopener noreferrer");

    const heic = screen.getByRole("link", { name: `${en.LawyerReview.downloadDocument}: File 1` });
    expect(heic).toHaveAttribute("href", documentRoute(DOC.heic));
    expect(heic).toHaveAttribute("target", "_blank");
    expect(heic).toHaveAttribute("rel", "noopener noreferrer");

    // A file the backend says cannot be opened is listed with nothing to open.
    expect(container.innerHTML).not.toContain(documentRoute(DOC.missing));
    expect(container.querySelectorAll("a[href]")).toHaveLength(2);
    for (const link of container.querySelectorAll("a[href]")) {
      expect(link.getAttribute("href")).toMatch(/^\/api\/review\/documents\/[0-9a-f-]{36}$/);
    }
    expect(container.textContent).toContain(`${en.IntakeEvidence.category.driversLicense} (1)`);
  });

  it("numbers unnamed files per kind within their group", async () => {
    const photo = (id: string) => ({ ...unnamedFiles[0], id, category: "incidentPhotos" });
    backendAnswers(200, {
      ...masked(),
      documents: [
        photo("4b5c6d7e-8f90-4a1b-8c2d-3e4f5a6b7c8d"),
        { ...unnamedFiles[2] },
        photo("5c6d7e8f-9012-4b3c-9d4e-5f6a7b8c9d0e"),
      ],
    });
    const { container } = await renderPage();
    openTab("documents");

    const labels = [
      ...container.querySelectorAll('[data-testid="next-image"][data-src^="/api/review/documents/"]'),
    ].map((node) => node.getAttribute("aria-label"));
    expect(labels).toEqual(["Photo 1", "Photo 2"]);
    expect(screen.getByRole("link", { name: `${en.LawyerReview.downloadDocument}: File 1` })).toBeInTheDocument();
  });

  it("lets the lawyer decide while the review is open", async () => {
    backendAnswers(200, masked());
    await renderPage();

    expect(screen.getByRole("button", { name: en.LawyerReviewDecision.accept })).toBeEnabled();
    expect(screen.getByRole("button", { name: en.LawyerReviewDecision.decline })).toBeEnabled();
    expect(screen.getByTestId("decision-countdown")).toBeInTheDocument();
  });

  it("refuses a masked answer that carries a patient block, rather than rendering it", async () => {
    backendAnswers(200, { ...masked(), patient: full.patient });
    const { container } = await renderPage();

    expect(container.textContent).toContain(en.LawyerReview.loadError);
    for (const value of PROTECTED) expect(container.innerHTML).not.toContain(value);
    expect(screen.queryByRole("button", { name: en.LawyerReviewDecision.accept })).toBeNull();
  });

  it("refuses a masked answer whose file carries its own name", async () => {
    backendAnswers(200, { ...masked(), documents: [files[0], ...unnamedFiles.slice(1)] });
    const { container } = await renderPage();

    expect(container.textContent).toContain(en.LawyerReview.loadError);
    expect(container.innerHTML).not.toContain("license.jpg");
    expect(container.querySelectorAll("a[href]")).toHaveLength(0);
  });

  it("refuses a masked answer whose file carries a URL", async () => {
    backendAnswers(200, {
      ...masked(),
      documents: [{ ...unnamedFiles[1], url: "https://project.supabase.co/storage/v1/object/sign/submissions/x.pdf" }],
    });
    const { container } = await renderPage();

    expect(container.textContent).toContain(en.LawyerReview.loadError);
    expect(container.innerHTML).not.toContain("/storage/v1/");
  });

  it("refuses a file id that is not a UUID, so nothing else can reach an href", async () => {
    backendAnswers(200, { ...masked(), documents: [{ ...unnamedFiles[1], id: "../../portal/submissions" }] });
    const { container } = await renderPage();

    expect(container.textContent).toContain(en.LawyerReview.loadError);
    expect(container.querySelectorAll("a[href]")).toHaveLength(0);
  });

  it("is in Spanish on the Spanish route", async () => {
    state.locale = "es";
    backendAnswers(200, masked());
    const { container } = await renderPage();

    expect(screen.getByTestId("decision-countdown")).toBeInTheDocument();
    expect(screen.getAllByText(es.LawyerReview.availableAfterAcceptance)).toHaveLength(5);
    expect(screen.getByRole("button", { name: es.LawyerReviewDecision.accept })).toBeEnabled();
    expect(container.textContent).toMatch(/17 nov(\.)? 2025/i);
    openTab("documents");
    expect(container.textContent).toContain(es.IntakeEvidence.category.driversLicense);
    expect(screen.getByRole("link", { name: `${es.LawyerReview.viewDocument}: PDF 1` })).toBeInTheDocument();
    expect(container.querySelector('[aria-label="Foto 1"]')).not.toBeNull();
  });
});

describe("lawyer review page, after acceptance", () => {
  it("shows the patient, the accident's date and place, the companion and the documents", async () => {
    backendAnswers(200, full);
    const { container } = await renderPage();

    expect(container.textContent).toContain(en.LawyerReviewDecision.accepted);
    expect(container.textContent).not.toContain(en.LawyerReview.notice.accepted);
    expect(screen.getByRole("heading", { name: "Marisol Quintanilla" })).toBeInTheDocument();
    expect(container.textContent).toContain("Marisol Quintanilla");
    expect(container.textContent).toContain("+1 (512) 555-0147");
    expect(container.textContent).toContain("marisol.q@example.com");
    expect(container.textContent).toContain("4417 Avenue F, Austin, TX 78751");
    expect(container.textContent).toContain("Round Rock, TX");
    expect(container.textContent).toContain("Nov 17, 2025");
    expect(container.textContent).toContain("Lamar Blvd & W 38th St, Austin, TX");
    expect(container.textContent).toContain("Teodoro Balderrama");
    openTab("documents");
    expect(container.textContent).toContain("license.jpg");
    expect(container.querySelector(`[data-src="${documentRoute(DOC.license)}"]`)).not.toBeNull();
    expect(container.textContent).not.toContain(en.LawyerReview.availableAfterAcceptance);
    expect(container.textContent).not.toContain(en.LawyerReview.documentsPending);
    expect(container.innerHTML).not.toContain("/storage/v1/");
  });

  it("opens every document the way its kind allows, in a new tab with no opener", async () => {
    backendAnswers(200, full);
    const { container } = await renderPage();
    openTab("documents");

    const pdf = screen.getByRole("link", { name: `${en.LawyerReview.viewDocument}: insurance-card.pdf` });
    expect(pdf).toHaveAttribute("href", documentRoute(DOC.insurance));
    expect(pdf).toHaveAttribute("target", "_blank");
    expect(pdf).toHaveAttribute("rel", "noopener noreferrer");

    const heic = screen.getByRole("link", { name: `${en.LawyerReview.downloadDocument}: IMG_2232.HEIC` });
    expect(heic).toHaveAttribute("href", documentRoute(DOC.heic));
    expect(heic).toHaveAttribute("target", "_blank");
    expect(heic).toHaveAttribute("rel", "noopener noreferrer");
    expect(container.querySelector(`[data-src="${documentRoute(DOC.heic)}"]`)).toBeNull();

    // A document that cannot be opened is listed, with nothing to open.
    expect(container.textContent).toContain("report-missing.pdf");
    expect(screen.queryByRole("link", { name: /report-missing\.pdf/ })).toBeNull();
    expect(container.querySelectorAll("a[href]")).toHaveLength(2);
  });

  it("offers the document actions in Spanish", async () => {
    state.locale = "es";
    backendAnswers(200, full);
    await renderPage();
    openTab("documents");

    expect(
      screen.getByRole("link", { name: `${es.LawyerReview.viewDocument}: insurance-card.pdf` })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: `${es.LawyerReview.downloadDocument}: IMG_2232.HEIC` })
    ).toBeInTheDocument();
  });

  it("refuses a full answer whose file id is not a UUID", async () => {
    backendAnswers(200, { ...full, documents: [{ ...files[1], id: "javascript:alert(document.cookie)" }] });
    const { container } = await renderPage();

    expect(container.textContent).toContain(en.LawyerReview.loadError);
    expect(container.querySelectorAll("a[href]")).toHaveLength(0);
  });

  it("does not offer a second decision", async () => {
    backendAnswers(200, full);
    const { container } = await renderPage();

    expect(screen.queryByRole("button", { name: en.LawyerReviewDecision.accept })).toBeNull();
    expect(screen.queryByRole("button", { name: en.LawyerReviewDecision.decline })).toBeNull();
    expect(container.textContent).toContain(en.LawyerReviewDecision.accepted);
    expect(container.textContent).not.toContain(en.LawyerReviewDecision.alreadySubmitted);
  });

  it("formats the date in Spanish on the Spanish route", async () => {
    state.locale = "es";
    backendAnswers(200, full);
    const { container } = await renderPage();

    expect(container.textContent).toContain(es.LawyerReviewDecision.accepted);
    expect(container.textContent).toMatch(/17 nov(\.)? 2025/i);
  });
});

describe("lawyer review page, closed reviews", () => {
  it("keeps a rejected review masked and closed, with the files withdrawn", async () => {
    backendAnswers(200, masked("rejected"));
    const { container } = await renderPage();

    expect(container.textContent).toContain(en.LawyerReviewDecision.rejected);
    expect(screen.getAllByText(en.LawyerReview.availableAfterAcceptance)).toHaveLength(5);
    expect(container.textContent).toContain("Lamar Blvd & W 38th St, Austin, TX");
    openTab("documents");
    expect(container.textContent).toContain(en.LawyerReview.documentsClosed);
    expect(container.textContent).toContain(en.IntakeEvidence.category.driversLicense);
    expect(container.querySelectorAll("a[href]")).toHaveLength(0);
    expect(container.innerHTML).not.toContain("/api/review/documents/");
    expect(screen.queryByRole("button", { name: en.LawyerReviewDecision.accept })).toBeNull();
    expect(screen.queryByRole("button", { name: en.LawyerReviewDecision.decline })).toBeNull();
    expect(container.textContent).not.toContain("Current status:");
    for (const value of PROTECTED) expect(container.innerHTML).not.toContain(value);
  });

  it("keeps an expired review masked and closed, with the files withdrawn", async () => {
    backendAnswers(200, masked("expired"));
    const { container } = await renderPage();

    expect(container.textContent).toContain(en.LawyerReviewDecision.noDecision);
    expect(screen.getAllByText(en.LawyerReview.availableAfterAcceptance)).toHaveLength(5);
    openTab("documents");
    expect(container.textContent).toContain(en.LawyerReview.documentsClosed);
    expect(container.querySelectorAll("a[href]")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: en.LawyerReviewDecision.accept })).toBeNull();
    expect(screen.queryByRole("button", { name: en.LawyerReviewDecision.decline })).toBeNull();
    expect(container.textContent).not.toContain(en.LawyerReview.decisionPrompt);
  });

  it("sends a refused or revoked link home", async () => {
    backendAnswers(401, { error: "token_revoked" });
    expect(await redirectOf(() => renderPage())).toBe("/");
  });

  it("shows an error, not a case, when the backend is down", async () => {
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const { container } = await renderPage();

    expect(container.textContent).toContain(en.LawyerReview.loadError);
  });
});

describe("lawyer review page, tampering", () => {
  it("does not let the URL choose the case", async () => {
    backendAnswers(200, masked());
    await renderPage({ submissionId: "0d9f6a2e-1c3b-4e5d-8f70-9a1b2c3d4e5f", access: "full", status: "accepted" });

    expect(reviewCaseCalls()).toHaveLength(1);
    expect(JSON.parse(String(reviewCaseCalls()[0]?.[1]?.body)).submissionId).toBe(SUBMISSION);
    expect(screen.getAllByText(en.LawyerReview.availableAfterAcceptance)).toHaveLength(5);
  });

  it("sends the old cookie home without asking the backend, whatever status it claims", async () => {
    state.cookies.set(
      "haa_review_access",
      cookieOf({
        claimantUserId: CLAIMANT,
        submissionId: SUBMISSION,
        assignmentId: "3f1c2b8e-8f5d-4c0a-9d3e-0b6a1e2f4c11",
        status: "accepted",
        canDecide: true,
      })
    );

    expect(await redirectOf(() => renderPage())).toBe("/");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a cookie for another patient home without asking the backend", async () => {
    state.cookies.set(
      "haa_review_access",
      cookieOf({ claimantUserId: "11111111-1111-4111-8111-111111111111", submissionId: SUBMISSION, token: TOKEN })
    );

    expect(await redirectOf(() => renderPage())).toBe("/");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends no cookie at all home", async () => {
    state.cookies.clear();
    expect(await redirectOf(() => renderPage())).toBe("/");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exchanges a fresh link for the cookie first, keeping the language", async () => {
    state.locale = "es";
    const location = await redirectOf(() => renderPage({ submissionId: SUBMISSION, t: TOKEN }));

    expect(location).toBe(
      `/api/review/unlock-link?claimantUserId=${CLAIMANT}&submissionId=${SUBMISSION}&t=${TOKEN}&next=${encodeURIComponent(`/es/review/${CLAIMANT}?submissionId=${SUBMISSION}`)}`
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// The page's copy comes from these namespaces; every key it uses has to exist
// in both languages, or next-intl renders the key itself.
// The signed retainer is the executed agreement, not evidence. Before
// acceptance the lawyer learns only that it is signed; afterwards it opens from
// the app's own /api/review/retainer route, which takes no id. Nothing that
// locates it ever reaches the page.
const RETAINER_ROUTE = "/api/review/retainer";
const signed = { signed: true, available: false };

describe("lawyer review page, signed retainer", () => {
  it("does not expose a retainer link before acceptance", async () => {
    backendAnswers(200, { ...masked(), signedRetainer: signed });
    const { container } = await renderPage();

    expect(screen.queryByRole("link", { name: en.LawyerReview.retainerView })).toBeNull();
    expect(container.innerHTML).not.toContain(RETAINER_ROUTE);
    expect(container.textContent).not.toContain(en.LawyerReview.retainerTitle);
    expect(container.textContent).toContain("Lamar Blvd & W 38th St, Austin, TX");
    openTab("documents");
    expect(container.querySelector(`[data-src="${documentRoute(DOC.license)}"]`)).not.toBeNull();
    for (const value of PROTECTED) expect(container.innerHTML).not.toContain(value);
  });

  it("refuses a masked answer that claims the retainer can be opened, rather than rendering it", async () => {
    backendAnswers(200, { ...masked(), signedRetainer: { signed: true, available: true } });
    const { container } = await renderPage();

    expect(container.textContent).toContain(en.LawyerReview.loadError);
    expect(container.innerHTML).not.toContain(RETAINER_ROUTE);
  });

  it("refuses a retainer block carrying anything that would locate it", async () => {
    for (const extra of [
      { url: "https://x.supabase.co/storage/v1/object/sign/agreements/a.pdf" },
      { id: DOC.license },
    ]) {
      backendAnswers(200, { ...full, signedRetainer: { signed: true, available: true, ...extra } });
      const { container, unmount } = await renderPage();
      expect(container.textContent).toContain(en.LawyerReview.loadError);
      expect(container.innerHTML).not.toContain("/storage/v1/");
      unmount();
    }
  });

  it("does not expose a retainer link after rejection or expiry", async () => {
    for (const status of ["rejected", "expired"] as const) {
      backendAnswers(200, { ...masked(status), signedRetainer: signed });
      const { container, unmount } = await renderPage();
      expect(screen.queryByRole("link", { name: en.LawyerReview.retainerView })).toBeNull();
      expect(container.innerHTML).not.toContain(RETAINER_ROUTE);
      unmount();
    }
  });

  it("does not show a retainer link when no signed retainer exists", async () => {
    backendAnswers(200, { ...masked(), signedRetainer: { signed: false, available: false } });
    const before = await renderPage();
    expect(screen.queryByRole("link", { name: en.LawyerReview.retainerView })).toBeNull();
    before.unmount();

    backendAnswers(200, { ...full, signedRetainer: { signed: false, available: false } });
    const after = await renderPage();
    expect(screen.queryByRole("link", { name: en.LawyerReview.retainerView })).toBeNull();
    expect(after.container.innerHTML).not.toContain(RETAINER_ROUTE);
  });

  it("shows no retainer link when the backend omits retainer data", async () => {
    backendAnswers(200, masked());
    const { container } = await renderPage();

    expect(screen.queryByRole("link", { name: en.LawyerReview.retainerView })).toBeNull();
    expect(container.textContent).not.toContain(en.LawyerReview.retainerTitle);
  });

  it("after acceptance: offers the signed retainer from the app's own route in a new tab", async () => {
    backendAnswers(200, { ...full, signedRetainer: { signed: true, available: true } });
    const { container } = await renderPage();

    const view = screen.getByRole("link", { name: en.LawyerReview.retainerView });
    expect(view).toHaveAttribute("href", RETAINER_ROUTE);
    expect(view).toHaveAttribute("target", "_blank");
    expect(view).toHaveAttribute("rel", "noopener noreferrer");
    expect(container.querySelectorAll("a[href]")).toHaveLength(1);
    expect(container.textContent).toContain("Marisol Quintanilla");
  });

  it("does not offer the retainer until its signed file is available", async () => {
    backendAnswers(200, { ...full, signedRetainer: signed });
    const { container } = await renderPage();

    expect(screen.queryByRole("link", { name: en.LawyerReview.retainerView })).toBeNull();
    expect(container.innerHTML).not.toContain(RETAINER_ROUTE);
  });

  it("labels the available retainer in Spanish after acceptance", async () => {
    state.locale = "es";
    backendAnswers(200, { ...masked(), signedRetainer: signed });
    const before = await renderPage();
    expect(screen.queryByRole("link", { name: es.LawyerReview.retainerView })).toBeNull();
    before.unmount();

    backendAnswers(200, { ...full, signedRetainer: { signed: true, available: true } });
    const after = await renderPage();
    expect(screen.getByRole("link", { name: es.LawyerReview.retainerView })).toHaveAttribute("href", RETAINER_ROUTE);
    expect(after.container.textContent).not.toContain(en.LawyerReview.retainerView);
  });
});

describe("lawyer review copy", () => {
  it("has every key in English and Spanish", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      value && typeof value === "object"
        ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
        : [prefix.slice(0, -1)];
    for (const namespace of ["LawyerReview", "LawyerReviewDecision"] as const) {
      expect(keys(es[namespace]).sort()).toEqual(keys(en[namespace]).sort());
    }
    const t = createTranslator({ locale: "es", messages: es, namespace: "LawyerReview" });
    expect(t("documentFileCount", { count: 1 })).toBe("1 archivo");
  });
});
