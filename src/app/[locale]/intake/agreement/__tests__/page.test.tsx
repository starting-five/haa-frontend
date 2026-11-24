import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en.json";
import type { EmbeddedSigningOptions } from "@/lib/docusign-embed";

// The agreement screen is where the patient signs, and signing must stay
// inside the application. These pin the contract around it: arriving here opens
// DocuSign's own ceremony straight away — there is NO HAA agreement presentation
// screen — mounted into an overlay shown on top of this page (never a page
// outside it), one session and one envelope, and only a backend-confirmed
// completion moves the patient on. DocuSign's own word that the session ended is
// never enough.
//
// Real messages are used rather than a stub, so a missing translation key
// fails here instead of showing the patient a raw key.

const realLocation = window.location;
const locationStub = {
  href: realLocation.href,
  origin: realLocation.origin,
  protocol: realLocation.protocol,
  host: realLocation.host,
  hostname: realLocation.hostname,
  port: realLocation.port,
  pathname: realLocation.pathname,
  search: realLocation.search,
  hash: realLocation.hash,
};
Object.defineProperty(window, "location", { configurable: true, writable: true, value: locationStub });

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/intake/agreement",
  useRouter: () => ({ push, replace, prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));
// the header this page renders builds a Supabase client and watches auth state
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);

vi.mock("@/hooks/use-require-session-key", () => ({ useRequireSessionKey: () => {} }));
vi.mock("@/hooks/use-preload-images", () => ({ usePreloadImages: () => {} }));

// The launch flag decides whether arriving here opens DocuSign at all. It is on
// for the ceremony contract below and off for the paused-launch cases at the end.
const launchEnabled = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/constants", async () => {
  const actual = await vi.importActual<typeof import("@/lib/constants")>("@/lib/constants");
  return {
    ...actual,
    get DOCUSIGN_LAUNCH_ENABLED() {
      return launchEnabled.value;
    },
  };
});

const createAgreement = vi.fn();
const getAgreementStatus = vi.fn();
vi.mock("@/services/intake", () => ({
  createAgreement: (...args: unknown[]) => createAgreement(...args),
  getAgreementStatus: (...args: unknown[]) => getAgreementStatus(...args),
}));

// The DocuSign library is replaced by a recorder: the test sees exactly what
// the screen asked to mount and can end the session the way DocuSign would.
const destroy = vi.fn();
let mounted: EmbeddedSigningOptions[] = [];
const startEmbeddedSigning = vi.fn(async (options: EmbeddedSigningOptions) => {
  mounted.push(options);
  return { destroy };
});
vi.mock("@/lib/docusign-embed", () => ({
  startEmbeddedSigning: (options: EmbeddedSigningOptions) => startEmbeddedSigning(options),
}));

import IntakeAgreementPage from "../page";

const signingReady = {
  ok: true,
  status: "sent",
  signingUrl: "https://demo.docusign.net/Signing/MTRedeem/v1/abc",
  embed: { scriptUrl: "https://js-d.docusign.com/bundle.js", integrationKey: "integration-key-under-test" },
};

const renderPage = () =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
    >
      <IntakeAgreementPage />
    </NextIntlClientProvider>
  );

// Signing starts by itself on arrival; a test just waits for the session to mount.
const waitForCeremony = async () => {
  await waitFor(() => expect(startEmbeddedSigning).toHaveBeenCalledTimes(1));
};

const endSession = async (sessionEndType: string) => {
  await act(async () => {
    mounted[mounted.length - 1]!.onSessionEnd({ sessionEndType });
  });
};

describe("agreement screen", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    createAgreement.mockReset();
    getAgreementStatus.mockReset();
    startEmbeddedSigning.mockClear();
    destroy.mockClear();
    mounted = [];
    sessionStorage.clear();
    sessionStorage.setItem("intake_submissionId", "eee0b2d0-2362-494c-a890-eb1e9931fe33");
    locationStub.href = realLocation.href;
    launchEnabled.value = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens DocuSign's ceremony on arrival, with no agreement presentation screen", async () => {
    createAgreement.mockResolvedValue(signingReady);

    renderPage();

    // The envelope is created from the submission alone; identity comes from the session.
    await waitFor(() => expect(createAgreement).toHaveBeenCalledWith("eee0b2d0-2362-494c-a890-eb1e9931fe33", "en"));
    await waitForCeremony();

    // No HAA agreement mock is shown: no document card, no "Sign Here" tap.
    expect(screen.queryByText(messages.IntakeAgreement.sectionTitle)).not.toBeInTheDocument();
    expect(screen.queryByText(messages.IntakeAgreement.body)).not.toBeInTheDocument();
    expect(screen.queryByText(messages.IntakeAgreement.signatureRequired)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: messages.IntakeAgreement.signHere })).not.toBeInTheDocument();

    // The ceremony is the overlay dialog, with the loading note over its container.
    const dialog = screen.getByRole("dialog");
    expect(dialog).toContainElement(screen.getByTestId("signing-container"));
    expect(screen.getByText(messages.IntakeAgreement.opening)).toBeInTheDocument();

    // The page itself never goes anywhere: no top-level DocuSign navigation.
    expect(locationStub.href).toBe(realLocation.href);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("mounts exactly one DocuSign session into this page", async () => {
    createAgreement.mockResolvedValue(signingReady);

    renderPage();
    await waitForCeremony();

    expect(createAgreement).toHaveBeenCalledTimes(1);
    const options = mounted[0]!;
    expect(options.signingUrl).toBe(signingReady.signingUrl);
    expect(options.scriptUrl).toBe(signingReady.embed.scriptUrl);
    expect(options.integrationKey).toBe(signingReady.embed.integrationKey);
    expect(options.container).toBe(screen.getByTestId("signing-container"));
  });

  it("closes the ceremony to a relaunch control and can reopen it", async () => {
    createAgreement.mockResolvedValue(signingReady);

    renderPage();
    await waitForCeremony();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Closing ends the session and returns to a relaunch control — not a mock of
    // the document — with nothing signed and no navigation out of the application.
    fireEvent.click(screen.getByRole("button", { name: messages.IntakeAgreement.close }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(destroy).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();

    // The relaunch control reopens a fresh ceremony.
    fireEvent.click(screen.getByRole("button", { name: messages.IntakeAgreement.continue }));
    await waitFor(() => expect(startEmbeddedSigning).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("returns to the dashboard only once the backend confirms the signature", async () => {
    createAgreement.mockResolvedValue(signingReady);
    getAgreementStatus.mockResolvedValue({ ok: true, status: "completed" });

    renderPage();
    await waitForCeremony();
    expect(replace).not.toHaveBeenCalled();

    await endSession("signing_complete");

    await waitFor(() => expect(getAgreementStatus).toHaveBeenCalledWith("eee0b2d0-2362-494c-a890-eb1e9931fe33"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/intake/dashboard"));
    expect(replace).toHaveBeenCalledTimes(1);
    // The signing layer is closed as the patient is sent on.
    expect(destroy).toHaveBeenCalled();
  });

  it("does not take DocuSign's word for it when the backend says otherwise", async () => {
    createAgreement.mockResolvedValue(signingReady);
    // DocuSign says complete; the backend, asked directly, says declined.
    getAgreementStatus.mockResolvedValue({ ok: true, status: "declined" });

    renderPage();
    await waitForCeremony();

    await endSession("signing_complete");

    expect(await screen.findByText(messages.IntakeAgreement.declined)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    // The relaunch control is offered so the patient can sign again.
    expect(screen.getByRole("button", { name: messages.IntakeAgreement.continue })).toBeEnabled();
  });

  it("returns to a quiet relaunch when the patient cancels", async () => {
    createAgreement.mockResolvedValue(signingReady);
    getAgreementStatus.mockResolvedValue({ ok: true, status: "sent" });

    renderPage();
    await waitForCeremony();

    await endSession("cancel");

    await waitFor(() => expect(screen.getByRole("button", { name: messages.IntakeAgreement.continue })).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("settles a session once even when DocuSign and the return route both report it", async () => {
    createAgreement.mockResolvedValue(signingReady);
    getAgreementStatus.mockResolvedValue({ ok: true, status: "completed" });

    renderPage();
    await waitForCeremony();

    await act(async () => {
      mounted[0]!.onSessionEnd({ sessionEndType: "signing_complete" });
      window.dispatchEvent(
        new MessageEvent("message", { data: { type: "haa:agreement-return" }, origin: window.location.origin })
      );
    });

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/intake/dashboard"));
    expect(getAgreementStatus).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("ignores a return message from another origin", async () => {
    createAgreement.mockResolvedValue(signingReady);
    getAgreementStatus.mockResolvedValue({ ok: true, status: "completed" });

    renderPage();
    await waitForCeremony();

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", { data: { type: "haa:agreement-return" }, origin: "https://demo.docusign.net" })
      );
    });

    expect(getAgreementStatus).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows the generic message and stays put when the backend refuses", async () => {
    createAgreement.mockResolvedValue({ ok: false, code: "submission_not_submitted" });

    renderPage();

    expect(await screen.findByText(messages.IntakeAgreement.signingUnavailable)).toBeInTheDocument();
    expect(startEmbeddedSigning).not.toHaveBeenCalled();
    expect(locationStub.href).toBe(realLocation.href);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("returns a case the admin has not accepted to the dashboard, with no ceremony and no notice", async () => {
    // A typed URL, or a case turned down after the patient reached this screen:
    // the backend refuses to open a session, and the dashboard shows where the
    // case stands.
    createAgreement.mockResolvedValue({ ok: false, code: "case_not_approved" });

    renderPage();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/intake/dashboard"));
    expect(startEmbeddedSigning).not.toHaveBeenCalled();
    expect(screen.queryByText(messages.IntakeAgreement.signingUnavailable)).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(locationStub.href).toBe(realLocation.href);
  });

  it("tells the patient the case is safe when DocuSign is out of capacity, without a retry prompt", async () => {
    createAgreement.mockResolvedValue({ ok: false, code: "signing_capacity_exceeded" });

    renderPage();

    expect(await screen.findByText(messages.IntakeAgreement.signingCapacity)).toBeInTheDocument();
    expect(screen.queryByText(messages.IntakeAgreement.signingUnavailable)).not.toBeInTheDocument();
    expect(startEmbeddedSigning).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("never falls back to leaving the application when the ceremony cannot be mounted", async () => {
    createAgreement.mockResolvedValue({ ok: true, status: "sent", signingUrl: signingReady.signingUrl });

    renderPage();

    expect(await screen.findByText(messages.IntakeAgreement.signingUnavailable)).toBeInTheDocument();
    expect(startEmbeddedSigning).not.toHaveBeenCalled();
    expect(locationStub.href).toBe(realLocation.href);
  });

  it("returns to the dashboard when the agreement is already signed", async () => {
    // No signing URL is returned once the envelope is completed.
    createAgreement.mockResolvedValue({ ok: true, status: "completed" });

    renderPage();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/intake/dashboard"));
    expect(startEmbeddedSigning).not.toHaveBeenCalled();
  });

  it("keeps the phone line as the way to speak to someone first", async () => {
    // Reach the relaunch surface (a refusal), where speak-to-someone lives.
    createAgreement.mockResolvedValue({ ok: false, code: "submission_not_submitted" });

    renderPage();
    await screen.findByText(messages.IntakeAgreement.signingUnavailable);

    fireEvent.click(screen.getByRole("button", { name: messages.IntakeAgreement.speakToSomeone }));

    expect(locationStub.href).toMatch(/^tel:/);
  });

  // While DOCUSIGN_LAUNCH_ENABLED is off (the Sandbox account's recipient cap)
  // the screen must ask DocuSign for nothing and still move the patient on.
  describe("with DocuSign launch disabled", () => {
    beforeEach(() => {
      launchEnabled.value = false;
    });

    it("shows the signing notice on arrival and asks the backend for nothing", async () => {
      renderPage();

      expect(await screen.findByText(messages.IntakeAgreement.signingPaused)).toBeInTheDocument();
      // No envelope, no signing URL, no ceremony, no overlay, no frame, no new page.
      expect(createAgreement).not.toHaveBeenCalled();
      expect(startEmbeddedSigning).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(document.querySelector("iframe")).toBeNull();
      expect(locationStub.href).toBe(realLocation.href);
      expect(push).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
      // The notice is not the retry copy: nothing was tried.
      expect(screen.queryByText(messages.IntakeAgreement.signingUnavailable)).not.toBeInTheDocument();
      // The overlay's "opening" note is out of the accessibility tree along with the overlay.
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("returns to the dashboard without creating anything", async () => {
      renderPage();
      await screen.findByText(messages.IntakeAgreement.signingPaused);

      fireEvent.click(screen.getByRole("button", { name: messages.IntakeAgreement.continue }));

      expect(push).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenCalledWith("/en/intake/dashboard");
      expect(createAgreement).not.toHaveBeenCalled();
      expect(startEmbeddedSigning).not.toHaveBeenCalled();
      expect(locationStub.href).toBe(realLocation.href);
    });

    it("keeps the phone line beside the notice", async () => {
      renderPage();
      await screen.findByText(messages.IntakeAgreement.signingPaused);

      fireEvent.click(screen.getByRole("button", { name: messages.IntakeAgreement.speakToSomeone }));

      expect(locationStub.href).toMatch(/^tel:/);
      expect(createAgreement).not.toHaveBeenCalled();
    });
  });
});
