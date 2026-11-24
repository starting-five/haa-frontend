import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../messages/en.json";
import es from "../../../../../messages/es.json";
import { SPLASH_DURATION_MS } from "@/lib/constants";

// The order of the first three screens, and the guards that hold it.
//
// Name, phone and code now come first, before anything is asked about the
// crash. Each screen guards on what the one before it stored, so the chain can
// only be walked forwards: a refresh keeps you where you are, a direct URL
// sends you back to the first thing you have not answered, and a session left
// over from an abandoned intake resumes rather than skips.

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/intake",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);
vi.mock("@/hooks/use-preload-images", () => ({ usePreloadImages: () => {} }));
vi.mock("next/image", () => ({ default: () => <span data-testid="next-image" /> }));

import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import NamePage from "../page";
import VerifiedPage from "../verified/page";
import IncidentPage from "../incident/page";
import ReassurancePage from "../reassurance/page";
import RolePage from "../role/page";

/**
 * The shared FloatingInput draws its label as a span rather than a <label for>,
 * so there is nothing to query by label text. The id is the stable handle.
 */
const field = (id: string) => {
  const input = document.getElementById(id);
  if (!(input instanceof HTMLInputElement)) throw new Error(`no field #${id}`);
  return input;
};

// the name screen mounts once it has asked who is signed in
const enterName = async (first = "Reva", last = "Lin") => {
  await waitFor(() => expect(field("firstName")).not.toBeNull());
  fireEvent.change(field("firstName"), { target: { value: first } });
  fireEvent.change(field("lastName"), { target: { value: last } });
};

const wrap = (node: React.ReactElement, messages: typeof en | typeof es = en, locale = "en") =>
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
    >
      {node}
    </NextIntlClientProvider>
  );

/** What each screen demands before it will show itself. */
const GUARDS: Record<string, { key: string; sendsBackTo: string }> = {
  phone: { key: "intake_firstName", sendsBackTo: "/intake" },
  otp: { key: "intake_phone", sendsBackTo: "/intake/phone" },
  verified: { key: "intake_submissionId", sendsBackTo: "/intake/phone" },
  incident: { key: "intake_submissionId", sendsBackTo: "/intake/phone" },
  fault: { key: "intake_incidentType", sendsBackTo: "/intake/incident" },
  date: { key: "intake_incidentType", sendsBackTo: "/intake/incident" },
  location: { key: "intake_incidentDate", sendsBackTo: "/intake/date" },
  reassurance: { key: "intake_incidentLocation", sendsBackTo: "/intake/location" },
};

/** Drives the guard hook the way each screen does, with nothing else mounted. */
function Guarded({ screen: name }: { screen: keyof typeof GUARDS }) {
  useRequireSessionKey(GUARDS[name].key, GUARDS[name].sendsBackTo);
  return <div data-testid="reached">{name}</div>;
}

describe("the first three screens come in order", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    sessionStorage.clear();
  });

  it("1. the name screen hands off to the phone screen", async () => {
    wrap(<NamePage />);
    await enterName();
    fireEvent.click(screen.getByRole("button", { name: en.Common.continue }));

    expect(sessionStorage.getItem("intake_firstName")).toBe("Reva");
    expect(push).toHaveBeenCalledWith("/en/intake/phone");
  });

  it("the name is still there when the phone screen asks for it", async () => {
    wrap(<NamePage />);
    await enterName();
    fireEvent.click(screen.getByRole("button", { name: en.Common.continue }));
    cleanup();

    // The phone screen's guard is the name, so nothing may have cleared it.
    wrap(<Guarded screen="phone" />);
    expect(screen.getByTestId("reached")).toHaveTextContent("phone");
    expect(replace).not.toHaveBeenCalled();
  });

  it("2/3. the accident screens open only once the case exists", () => {
    // Everything the phone and code screens store, and nothing more.
    sessionStorage.setItem("intake_firstName", "Reva");
    sessionStorage.setItem("intake_phone", "+14075551234");
    sessionStorage.setItem("intake_submissionId", "sub-1");

    wrap(<Guarded screen="incident" />);
    expect(screen.getByTestId("reached")).toHaveTextContent("incident");
    expect(replace).not.toHaveBeenCalled();
  });

  it("the Verified screen stands between the code and the first accident question", () => {
    sessionStorage.setItem("intake_firstName", "Reva");
    sessionStorage.setItem("intake_phone", "+14075551234");
    sessionStorage.setItem("intake_submissionId", "sub-1");

    vi.useFakeTimers();
    try {
      wrap(<VerifiedPage />);
      expect(screen.getByRole("heading", { name: en.IntakeVerified.heading })).toBeTruthy();
      expect(replace).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(SPLASH_DURATION_MS);
      });
      expect(replace).toHaveBeenCalledWith("/en/intake/incident");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the sequence cannot be skipped", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    sessionStorage.clear();
  });

  it("12. a direct URL to any later screen goes back to what is unanswered", () => {
    for (const [name, guard] of Object.entries(GUARDS)) {
      replace.mockReset();
      cleanup();
      sessionStorage.clear();

      wrap(<Guarded screen={name as keyof typeof GUARDS} />);
      expect(replace, `${name} let an empty session through`).toHaveBeenCalledWith(`/en${guard.sendsBackTo}`);
    }
  });

  it("the Verified screen cannot be opened before a code has been accepted", () => {
    // Everything the name and phone screens store — but no case, because no
    // code was accepted. The screen that announces verification must not show.
    sessionStorage.setItem("intake_firstName", "Reva");
    sessionStorage.setItem("intake_phone", "+14075551234");

    wrap(<VerifiedPage />);
    expect(replace).toHaveBeenCalledWith("/en/intake/phone");
  });

  it("verification alone does not unlock the screens that follow the accident", () => {
    // The case now exists from the moment the code is verified, so a submission
    // id no longer proves the crash questions were answered. Anything after
    // them has to guard on one of their answers instead.
    sessionStorage.setItem("intake_submissionId", "sub-1");

    wrap(<Guarded screen="reassurance" />);
    expect(replace).toHaveBeenCalledWith("/en/intake/location");
  });

  it("and neither does it unlock the screens after the recovery questions", () => {
    sessionStorage.setItem("intake_submissionId", "sub-1");
    wrap(<RolePage />);
    expect(replace).toHaveBeenCalledWith("/en/intake/treatment-area");
  });

  it("9. a refresh part-way through keeps the patient on that screen", () => {
    sessionStorage.setItem("intake_firstName", "Reva");
    sessionStorage.setItem("intake_phone", "+14075551234");
    sessionStorage.setItem("intake_submissionId", "sub-1");
    sessionStorage.setItem("intake_incidentType", "car");

    // A refresh is a fresh mount against the same session.
    for (const name of ["phone", "otp", "verified", "incident", "fault"] as const) {
      replace.mockReset();
      cleanup();
      wrap(<Guarded screen={name} />);
      expect(replace, `${name} bounced on refresh`).not.toHaveBeenCalled();
    }
  });

  it("10. an intake abandoned after the code screen resumes at the accident questions", () => {
    // What is left in a tab that was closed after verification.
    sessionStorage.setItem("intake_firstName", "Reva");
    sessionStorage.setItem("intake_phone", "+14075551234");
    sessionStorage.setItem("intake_submissionId", "sub-1");

    wrap(<IncidentPage />);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText(en.IntakeIncident.heading)).toBeInTheDocument();
  });

  it("a submitted case is still sent forward, not back to the start", async () => {
    // Submitting clears the answers on purpose, so every pre-submit guard
    // fails afterwards. They forward to where the post-submit flow begins —
    // the dashboard, where the case waits for review — rather than cascading
    // back to the first screen.
    sessionStorage.setItem("intake_submissionId", "sub-1");
    sessionStorage.setItem("intake_submitted", "1");

    wrap(<Guarded screen="reassurance" />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/intake/dashboard"));
    expect(replace).not.toHaveBeenCalledWith("/en/intake/choose-attorney");
  });
});

describe("11. the order holds in Spanish", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    sessionStorage.clear();
  });

  it("the name screen hands off to the phone screen", async () => {
    wrap(<NamePage />, es, "es");
    await enterName();
    fireEvent.click(screen.getByRole("button", { name: es.Common.continue }));

    expect(push).toHaveBeenCalledWith("/en/intake/phone");
  });

  it("the accident screens still wait for the case", async () => {
    wrap(<ReassurancePage />, es, "es");
    await act(async () => {});
    expect(replace).toHaveBeenCalledWith("/en/intake/location");
  });
});
