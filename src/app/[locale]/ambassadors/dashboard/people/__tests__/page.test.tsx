import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../../messages/en.json";
import es from "../../../../../../../messages/es.json";

// The People Helped list renders each person's case status from the label the
// route chose (api/ambassadors/people). A retainer sent and not yet signed
// reads Awaiting Signature, in both languages, and an entry cached before that
// label existed — which may say Signed — is deleted rather than shown.

const nav = vi.hoisted(() => ({ locale: "en" }));
vi.mock("next/navigation", () => ({
  usePathname: () => `/${nav.locale}/ambassadors/dashboard/people`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: nav.locale }),
}));

vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);

import PeoplePage from "../page";

const person = (id: string, name: string, statusKey: string) => ({
  id,
  name,
  incident: "Car",
  date: "2026-09-20",
  phone: "",
  email: "",
  location: "Tampa, FL",
  statusKey,
  leadCreatedAt: "2026-09-21T10:00:00.000Z",
});

const fetchMock = vi.fn();
const peopleAre = (people: unknown[]) =>
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ people }), { status: 200 }));

const renderPage = (locale: "en" | "es" = "en") => {
  nav.locale = locale;
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "es" ? es : en}
    >
      <PeoplePage />
    </NextIntlClientProvider>
  );
};

beforeEach(() => {
  window.localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("People Helped statuses", () => {
  it("shows a retainer awaiting signature as Awaiting Signature, and a signed one as Signed", async () => {
    peopleAre([
      person("a", "Ada Waits", "statusAwaitingSignature"),
      person("b", "Bea Signed", "statusSigned"),
      person("c", "Cy Submitted", "statusSubmitted"),
    ]);
    renderPage();

    expect(await screen.findByText(en.AmbassadorPeople.statusAwaitingSignature)).toBeInTheDocument();
    expect(screen.getAllByText(en.AmbassadorPeople.statusSigned)).toHaveLength(1);
    expect(screen.getByText(en.AmbassadorPeople.statusSubmitted)).toBeInTheDocument();
  });

  it("says the same in Spanish", async () => {
    peopleAre([person("a", "Ada Waits", "statusAwaitingSignature"), person("b", "Bea Signed", "statusSigned")]);
    renderPage("es");

    expect(await screen.findByText(es.AmbassadorPeople.statusAwaitingSignature)).toBeInTheDocument();
    expect(screen.getAllByText(es.AmbassadorPeople.statusSigned)).toHaveLength(1);
    expect(screen.queryByText(en.AmbassadorPeople.statusAwaitingSignature)).toBeNull();
  });

  it("deletes the old cache, which could say Signed, instead of showing it while the list loads", async () => {
    window.localStorage.setItem("ambassador_people_cache_v1", JSON.stringify([person("a", "Ada Waits", "statusSigned")]));
    let release: (value: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (release = resolve)));
    renderPage();

    await waitFor(() => expect(window.localStorage.getItem("ambassador_people_cache_v1")).toBeNull());
    expect(screen.queryByText("Ada Waits")).toBeNull();
    expect(screen.queryByText(en.AmbassadorPeople.statusSigned)).toBeNull();

    release(new Response(JSON.stringify({ people: [person("a", "Ada Waits", "statusAwaitingSignature")] })));
    expect(await screen.findByText(en.AmbassadorPeople.statusAwaitingSignature)).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("ambassador_people_cache_v2") ?? "[]")[0].statusKey).toBe(
      "statusAwaitingSignature"
    );
  });

  it("has the label in both languages", () => {
    expect(en.AmbassadorPeople.statusAwaitingSignature).toBe("Awaiting Signature");
    expect(es.AmbassadorPeople.statusAwaitingSignature).toBe("Pendiente de firma");
    expect(Object.keys(es.AmbassadorPeople).sort()).toEqual(Object.keys(en.AmbassadorPeople).sort());
  });
});
