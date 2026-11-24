import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en.json";
import { SUPPORT_PHONE_TEL } from "@/lib/constants";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/intake/tell",
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));
vi.mock("@/hooks/use-require-session-key", () => ({ useRequireSessionKey: () => {} }));
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);
vi.mock("next/image", () => ({
  default: () => <span data-testid="next-image" />,
}));

const realLocation = window.location;
Object.defineProperty(window, "location", {
  configurable: true,
  writable: true,
  value: { ...realLocation, href: realLocation.href },
});

import IntakeTellPage from "../page";

const renderPage = () =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
    >
      <IntakeTellPage />
    </NextIntlClientProvider>
  );

describe("intake tell CTA selection", () => {
  beforeEach(() => {
    push.mockReset();
    sessionStorage.clear();
    window.location.href = realLocation.href;
  });

  it("starts with only Tap to talk active", () => {
    renderPage();

    const mic = screen.getByRole("button", { name: messages.IntakeTell.micMode });
    const keyboard = screen.getByRole("button", { name: messages.IntakeTell.keyboardMode });
    const headphones = screen.getByRole("button", { name: messages.IntakeTell.headphonesMode });

    expect(mic).toHaveAttribute("aria-pressed", "true");
    expect(keyboard).toHaveAttribute("aria-pressed", "false");
    expect(headphones).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps only the last pressed CTA active when Talk to someone now is tapped", () => {
    renderPage();

    const mic = screen.getByRole("button", { name: messages.IntakeTell.micMode });
    const keyboard = screen.getByRole("button", { name: messages.IntakeTell.keyboardMode });
    const headphones = screen.getByRole("button", { name: messages.IntakeTell.headphonesMode });

    fireEvent.click(headphones);

    expect(headphones).toHaveAttribute("aria-pressed", "true");
    expect(mic).toHaveAttribute("aria-pressed", "false");
    expect(keyboard).toHaveAttribute("aria-pressed", "false");
    expect(window.location.href).toBe(SUPPORT_PHONE_TEL);
  });
});

// The dictation states a patient can hit on a phone, in the words the page
// shows for them. The recogniser itself is a scriptable stand-in; the hook's
// own suite covers its behaviour in depth.
class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {}
  stop() {}
  abort() {}
}

const tapToTalk = () => {
  fireEvent.click(screen.getByRole("button", { name: messages.IntakeTell.micMode }));
  fireEvent.click(screen.getByRole("button", { name: messages.IntakeTell.tapToTalk }));
};

describe("intake tell dictation states", () => {
  beforeEach(() => {
    push.mockReset();
    sessionStorage.clear();
    FakeRecognition.last = null;
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says voice input is unavailable when the browser has no recogniser", () => {
    renderPage();
    tapToTalk();
    expect(screen.getByRole("status")).toHaveTextContent(messages.IntakeTell.micUnsupported);
  });

  it("says a secure connection is needed on a plain-http origin", () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    renderPage();
    tapToTalk();
    expect(screen.getByRole("status")).toHaveTextContent(messages.IntakeTell.micInsecureContext);
  });

  it("explains a blocked microphone rather than a generic capture failure", async () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
    vi.stubGlobal("navigator", {
      ...navigator,
      permissions: { query: async () => ({ state: "denied" as PermissionState }) },
    });
    renderPage();
    tapToTalk();
    await act(async () => {
      FakeRecognition.last?.onerror?.({ error: "not-allowed" });
      FakeRecognition.last?.onend?.();
    });
    expect(screen.getByRole("status")).toHaveTextContent(messages.IntakeTell.micPermissionNeeded);
    expect(screen.getByRole("button", { name: messages.IntakeTell.tapToTalk })).toBeInTheDocument();
  });

  it("treats a silent session as a prompt to tap again, not as a capture failure", async () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
    renderPage();
    tapToTalk();
    expect(screen.getByText(messages.IntakeTell.listening)).toBeInTheDocument();
    await act(async () => {
      FakeRecognition.last?.onerror?.({ error: "no-speech" });
      FakeRecognition.last?.onend?.();
    });
    // One silent run restarts quietly.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText(messages.IntakeTell.listening)).toBeInTheDocument();
    await act(async () => {
      FakeRecognition.last?.onerror?.({ error: "no-speech" });
      FakeRecognition.last?.onend?.();
    });
    expect(screen.getByRole("status")).toHaveTextContent(messages.IntakeTell.micNoSpeech);
    expect(screen.queryByText(messages.IntakeTell.micError)).not.toBeInTheDocument();
  });

  it("puts what was said into the draft and enables Continue", async () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
    renderPage();
    tapToTalk();
    expect(FakeRecognition.last?.lang).toBe("en-US");
    await act(async () => {
      FakeRecognition.last?.onresult?.({
        resultIndex: 0,
        results: { length: 1, 0: { 0: { transcript: "A car hit me at the light", confidence: 0.9 }, isFinal: true } },
      });
    });
    expect(screen.getByRole("textbox")).toHaveValue("A car hit me at the light");
    expect(screen.getByRole("button", { name: messages.Common.continue })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
