import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  MAX_SILENT_SESSIONS,
  classifySpeechError,
  getSpeechRecognitionConstructor,
  refineNotAllowed,
  useSpeechDictation,
  type SpeechRecognitionErrorEventLike,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
} from "../use-speech-dictation";

// A scriptable stand-in for the browser's recogniser. Each `new` records the
// instance so a test can drive its events in the order a real browser would:
// results, then error, then end.
class FakeRecognition implements SpeechRecognitionLike {
  static instances: FakeRecognition[] = [];
  static startImpl: (() => void) | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  started = 0;
  stopped = 0;
  aborted = 0;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null = null;

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start() {
    this.started += 1;
    FakeRecognition.startImpl?.();
  }

  stop() {
    this.stopped += 1;
  }

  abort() {
    this.aborted += 1;
  }

  // Emit one result event the way Chrome shapes it.
  emit(results: { text: string; final: boolean; confidence?: number }[], resultIndex = 0) {
    const list = results.map(({ text, final, confidence = 0.9 }) => ({
      0: { transcript: text, confidence },
      isFinal: final,
    }));
    this.onresult?.({ resultIndex, results: Object.assign(list, { length: list.length }) });
  }

  fail(error: string) {
    this.onerror?.({ error });
  }

  end() {
    this.onend?.();
  }
}

const latest = () => FakeRecognition.instances[FakeRecognition.instances.length - 1];

const installRecognition = () => {
  vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
};

const setSecureContext = (value: boolean) => {
  Object.defineProperty(window, "isSecureContext", { configurable: true, value });
};

describe("capability detection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("finds the recogniser under either name and reports none otherwise", () => {
    expect(getSpeechRecognitionConstructor({} as Window)).toBeNull();
    expect(getSpeechRecognitionConstructor({ webkitSpeechRecognition: FakeRecognition } as unknown as Window)).toBe(
      FakeRecognition
    );
    expect(getSpeechRecognitionConstructor({ SpeechRecognition: FakeRecognition } as unknown as Window)).toBe(
      FakeRecognition
    );
    expect(getSpeechRecognitionConstructor(undefined)).toBeNull();
  });

  it("classifies every error code the specification defines", () => {
    expect(classifySpeechError("not-allowed")).toBe("permission");
    expect(classifySpeechError("service-not-allowed")).toBe("permission");
    expect(classifySpeechError("audio-capture")).toBe("no-microphone");
    expect(classifySpeechError("network")).toBe("network");
    expect(classifySpeechError("no-speech")).toBe("no-speech");
    expect(classifySpeechError("aborted")).toBe("aborted");
    expect(classifySpeechError("language-not-supported")).toBe("unknown");
    expect(classifySpeechError("")).toBe("unknown");
  });

  it("reads a not-allowed with an un-denied microphone as the browser refusing, not the patient", async () => {
    const query = (state: PermissionState) =>
      ({ permissions: { query: async () => ({ state }) } }) as unknown as Navigator;
    expect(await refineNotAllowed(query("denied"))).toBe("permission");
    expect(await refineNotAllowed(query("prompt"))).toBe("unsupported");
    expect(await refineNotAllowed(query("granted"))).toBe("unsupported");
    // Safari has no microphone entry in the Permissions API and throws.
    expect(
      await refineNotAllowed({
        permissions: {
          query: async () => {
            throw new TypeError("not supported");
          },
        },
      } as unknown as Navigator)
    ).toBe("permission");
    expect(await refineNotAllowed({} as Navigator)).toBe("permission");
    expect(await refineNotAllowed(undefined)).toBe("permission");
  });
});

describe("useSpeechDictation", () => {
  const onFinal = vi.fn();

  beforeEach(() => {
    FakeRecognition.instances = [];
    FakeRecognition.startImpl = null;
    onFinal.mockReset();
    setSecureContext(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const renderDictation = (lang = "en-US") => renderHook(() => useSpeechDictation({ lang, onFinal }));

  it("reports unsupported when the browser has no recogniser", () => {
    const { result } = renderDictation();
    expect(result.current.supported).toBe(false);
    act(() => result.current.start());
    expect(result.current.failure).toBe("unsupported");
    expect(result.current.listening).toBe(false);
  });

  it("refuses an insecure origin before touching the microphone", () => {
    installRecognition();
    setSecureContext(false);
    const { result } = renderDictation();
    act(() => result.current.start());
    expect(result.current.failure).toBe("insecure-context");
    expect(FakeRecognition.instances).toHaveLength(0);
  });

  it("starts a continuous, interim session in the requested language", () => {
    installRecognition();
    const { result } = renderDictation("es-ES");
    expect(result.current.supported).toBe(true);
    act(() => result.current.start());
    const session = latest();
    expect(session.started).toBe(1);
    expect(session.lang).toBe("es-ES");
    expect(session.continuous).toBe(true);
    expect(session.interimResults).toBe(true);
    expect(result.current.listening).toBe(true);
  });

  it("delivers finals once, in order, and exposes the interim phrase", () => {
    installRecognition();
    const { result } = renderDictation();
    act(() => result.current.start());
    const session = latest();

    act(() => session.emit([{ text: "I was ", final: false }]));
    expect(result.current.interim).toBe("I was");
    expect(onFinal).not.toHaveBeenCalled();

    act(() => session.emit([{ text: "I was driving home", final: true }]));
    expect(onFinal).toHaveBeenCalledWith("I was driving home");
    expect(result.current.interim).toBe("");

    // Chrome appends later results after the earlier ones; only the new
    // index is read.
    act(() =>
      session.emit(
        [
          { text: "I was driving home", final: true },
          { text: "and a car hit me", final: true },
        ],
        1
      )
    );
    expect(onFinal).toHaveBeenCalledTimes(2);
    expect(onFinal).toHaveBeenLastCalledWith("and a car hit me");
  });

  it("drops the duplicated final result Android delivers", () => {
    installRecognition();
    const { result } = renderDictation();
    act(() => result.current.start());
    const session = latest();
    act(() => session.emit([{ text: "it was raining", final: true, confidence: 0.8 }]));
    act(() => session.emit([{ text: "it was raining", final: true, confidence: 0 }]));
    expect(onFinal).toHaveBeenCalledTimes(1);
  });

  it("keeps the last interim phrase when the session ends without a final (Android)", () => {
    installRecognition();
    const { result } = renderDictation();
    act(() => result.current.start());
    const first = latest();
    act(() => first.emit([{ text: "the other driver", final: false }]));
    act(() => first.emit([{ text: "the other driver ran the light", final: false }]));
    act(() => first.end());
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledWith("the other driver ran the light");
    // Still wanted, so a new session took over.
    expect(result.current.listening).toBe(true);
    expect(FakeRecognition.instances).toHaveLength(2);
  });

  it("restarts after Android ends the session at the first pause, until stopped", () => {
    installRecognition();
    const { result } = renderDictation();
    act(() => result.current.start());
    const first = latest();
    act(() => first.emit([{ text: "first sentence", final: true }]));
    act(() => first.end());

    expect(FakeRecognition.instances).toHaveLength(2);
    const second = latest();
    expect(second.started).toBe(1);
    expect(result.current.listening).toBe(true);

    act(() => second.emit([{ text: "second sentence", final: true }]));
    act(() => result.current.stop());
    expect(second.stopped).toBe(1);
    expect(result.current.listening).toBe(false);
    act(() => second.end());
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(onFinal.mock.calls.map(([text]) => text)).toEqual(["first sentence", "second sentence"]);
    expect(result.current.failure).toBeNull();
  });

  it("treats silence as benign until the cap, then asks the patient to tap again", () => {
    installRecognition();
    const { result } = renderDictation();
    act(() => result.current.start());

    for (let run = 1; run < MAX_SILENT_SESSIONS; run += 1) {
      const session = latest();
      act(() => session.fail("no-speech"));
      act(() => session.end());
      expect(result.current.failure).toBeNull();
      expect(result.current.listening).toBe(true);
      expect(FakeRecognition.instances).toHaveLength(run + 1);
    }

    const last = latest();
    act(() => last.fail("no-speech"));
    act(() => last.end());
    expect(result.current.failure).toBe("no-speech");
    expect(result.current.listening).toBe(false);
    expect(FakeRecognition.instances).toHaveLength(MAX_SILENT_SESSIONS);
  });

  it("resets the silence count once the patient speaks", () => {
    installRecognition();
    const { result } = renderDictation();
    act(() => result.current.start());
    act(() => latest().fail("no-speech"));
    act(() => latest().end());
    act(() => latest().emit([{ text: "hello", final: true }]));
    act(() => latest().end());
    act(() => latest().fail("no-speech"));
    act(() => latest().end());
    expect(result.current.failure).toBeNull();
    expect(result.current.listening).toBe(true);
  });

  it.each([
    ["not-allowed", "permission"],
    ["service-not-allowed", "permission"],
    ["audio-capture", "no-microphone"],
    ["network", "network"],
    ["language-not-supported", "unknown"],
  ] as const)("stops on %s and reports %s without restarting", (code, failure) => {
    installRecognition();
    const { result } = renderDictation();
    act(() => result.current.start());
    const session = latest();
    act(() => session.fail(code));
    act(() => session.end());
    expect(result.current.failure).toBe(failure);
    expect(result.current.listening).toBe(false);
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it("upgrades a not-allowed to unsupported when the microphone permission is not denied", async () => {
    installRecognition();
    vi.stubGlobal("navigator", {
      ...navigator,
      permissions: { query: async () => ({ state: "prompt" as PermissionState }) },
    });
    const { result } = renderDictation();
    act(() => result.current.start());
    const session = latest();
    await act(async () => {
      session.fail("not-allowed");
      session.end();
    });
    expect(result.current.failure).toBe("unsupported");
  });

  it("stays quiet on aborted, which is the patient stopping", () => {
    installRecognition();
    const { result } = renderDictation();
    act(() => result.current.start());
    const session = latest();
    act(() => result.current.stop());
    act(() => session.fail("aborted"));
    act(() => session.end());
    expect(result.current.failure).toBeNull();
    expect(result.current.listening).toBe(false);
  });

  it("reports unknown when the recogniser refuses to start", () => {
    installRecognition();
    FakeRecognition.startImpl = () => {
      throw new DOMException("already started", "InvalidStateError");
    };
    const { result } = renderDictation();
    act(() => result.current.start());
    expect(result.current.failure).toBe("unknown");
    expect(result.current.listening).toBe(false);
    expect(latest().onend).toBeNull();
  });

  it("ignores events from a session it has already replaced", () => {
    installRecognition();
    const { result } = renderDictation();
    act(() => result.current.start());
    const first = latest();

    // Stop and start again before the browser has fired the old session's
    // `end` — a quick double tap. The old session is still wired up.
    act(() => result.current.stop());
    act(() => result.current.start());
    const second = latest();
    expect(second).not.toBe(first);
    expect(result.current.listening).toBe(true);

    // Its late error and end must not touch the new session, nor spawn a
    // third one.
    act(() => first.fail("network"));
    act(() => first.end());
    expect(result.current.listening).toBe(true);
    expect(result.current.failure).toBeNull();
    expect(FakeRecognition.instances).toHaveLength(2);
    act(() => first.emit([{ text: "stale", final: true }]));
    expect(onFinal).not.toHaveBeenCalledWith("stale");

    // The live session still works.
    act(() => second.emit([{ text: "live", final: true }]));
    expect(onFinal).toHaveBeenCalledWith("live");
  });

  it("toggle starts when idle and stops when listening; a second start is a no-op", () => {
    installRecognition();
    const { result } = renderDictation();
    act(() => result.current.toggle());
    expect(result.current.listening).toBe(true);
    act(() => result.current.start());
    expect(FakeRecognition.instances).toHaveLength(1);
    act(() => result.current.toggle());
    expect(result.current.listening).toBe(false);
    expect(latest().stopped).toBe(1);
  });

  it("aborts the live session and detaches its handlers on unmount", () => {
    installRecognition();
    const { result, unmount } = renderDictation();
    act(() => result.current.start());
    const session = latest();
    unmount();
    expect(session.aborted).toBe(1);
    expect(session.onresult).toBeNull();
    expect(session.onend).toBeNull();
    expect(session.onerror).toBeNull();
  });

  it("clearFailure forgets the last failure", () => {
    const { result } = renderDictation();
    act(() => result.current.start());
    expect(result.current.failure).toBe("unsupported");
    act(() => result.current.clearFailure());
    expect(result.current.failure).toBeNull();
  });
});
