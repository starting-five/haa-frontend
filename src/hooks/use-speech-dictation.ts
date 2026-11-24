"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Dictation for the tell-your-story screen, on the Web Speech API. Nothing is
// recorded or uploaded: the browser's recogniser hands back text and the page
// appends it to the draft.
//
// The API is the same object on every browser that has it, but not the same
// behaviour, and the differences are what used to surface as "we could not
// capture audio" on phones:
//
//   - Chrome for Android accepts `continuous = true` and ignores it (MDN's
//     compatibility data records the property as "can be set, but has no
//     effect"). The session ends at the first pause, so a single-shot loop is
//     the only way to keep listening across sentences. Each restart replays the
//     system's listening chime; that is the platform's own behaviour.
//   - Android can end a session with only interim results and never a final
//     one, and can deliver the same final result twice. Both are handled here
//     so the page only ever sees clean, once-only text.
//   - A few seconds of silence raises `no-speech` and ends the session, on
//     every platform. It is not a failure; it is capped so the microphone does
//     not stay open indefinitely.
//   - Plain-http origins and embedded web views answer `not-allowed` at once.
//     Those are distinguished from a real permission denial where the
//     Permissions API allows it, so the message can say what to do.
//
// Every handler checks it still belongs to the current session: a superseded
// recogniser firing `end` or `error` late must not flip the state of the one
// that replaced it.

// The Web Speech API is not in the default TypeScript DOM library.
export interface SpeechRecognitionResultLike {
  0: { transcript: string; confidence: number };
  isFinal: boolean;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

export interface SpeechRecognitionErrorEventLike {
  error: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

/**
 * Why dictation cannot be used right now, in terms the page can explain.
 *
 *   unsupported       no recogniser in this browser (Firefox, most in-app browsers)
 *   insecure-context  plain http; Chrome refuses the microphone outright
 *   permission        microphone blocked for this site, or the embedding app
 *                     never asked for it
 *   no-microphone     no usable input device, or another app holds it
 *   network           the recogniser needs the network and could not reach it
 *   no-speech         the session ran out waiting for the patient to speak
 *   unknown           anything else, including a recogniser that would not start
 */
export type DictationFailure =
  "unsupported" | "insecure-context" | "permission" | "no-microphone" | "network" | "no-speech" | "unknown";

// Consecutive silent sessions before the loop gives up and asks the patient to
// tap again. Two covers one false start plus one genuine pause.
export const MAX_SILENT_SESSIONS = 2;

export function getSpeechRecognitionConstructor(
  win: Window | undefined = globalThis.window
): SpeechRecognitionConstructor | null {
  if (!win) return null;
  const speechWindow = win as unknown as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

/**
 * Maps a `SpeechRecognitionErrorEvent.error` code to what the page should say.
 * `no-speech` and `aborted` are not failures of the feature: the first is
 * reported so the loop can count it, the second (user stop, or a superseded
 * session) is dropped.
 */
export function classifySpeechError(code: string): DictationFailure | "aborted" {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "permission";
    case "audio-capture":
      return "no-microphone";
    case "network":
      return "network";
    case "no-speech":
      return "no-speech";
    case "aborted":
      return "aborted";
    default:
      return "unknown";
  }
}

/**
 * A `not-allowed` from a browser whose Permissions API says the microphone is
 * not denied is the browser itself refusing — an in-app browser or web view
 * rather than the patient. Reported as `unsupported` so the advice is to open
 * the page in a real browser, not to change a permission that is already fine.
 * Browsers without the API keep the plain permission reading.
 */
export async function refineNotAllowed(nav: Navigator | undefined = globalThis.navigator): Promise<DictationFailure> {
  const permissions = nav?.permissions;
  if (!permissions?.query) return "permission";
  try {
    const status = await permissions.query({ name: "microphone" as PermissionName });
    return status.state === "denied" ? "permission" : "unsupported";
  } catch {
    return "permission";
  }
}

export interface UseSpeechDictationOptions {
  lang: string;
  /** Receives each final phrase exactly once, trimmed, in order. */
  onFinal: (text: string) => void;
}

export interface UseSpeechDictationReturn {
  /** The browser has a recogniser at all. */
  supported: boolean;
  /** The microphone is open and results are expected. */
  listening: boolean;
  /** The phrase being recognised right now, if the browser offers one. */
  interim: string;
  failure: DictationFailure | null;
  start: () => void;
  stop: () => void;
  /** Start when idle, stop when listening. */
  toggle: () => void;
  clearFailure: () => void;
}

export function useSpeechDictation({ lang, onFinal }: UseSpeechDictationOptions): UseSpeechDictationReturn {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [failure, setFailure] = useState<DictationFailure | null>(null);

  // The recogniser whose events still count. Anything else is a stale session.
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // True from start() until stop(), a fatal error or the silence cap: the
  // intent to keep listening, which is what decides whether `end` restarts.
  const activeRef = useRef(false);
  const silentSessionsRef = useRef(0);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const langRef = useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    setSupported(getSpeechRecognitionConstructor() !== null);
  }, []);

  const detach = useCallback((recognition: SpeechRecognitionLike) => {
    recognition.onresult = null;
    recognition.onend = null;
    recognition.onerror = null;
  }, []);

  const finish = useCallback((nextFailure: DictationFailure | null) => {
    activeRef.current = false;
    recognitionRef.current = null;
    setListening(false);
    setInterim("");
    if (nextFailure) setFailure(nextFailure);
  }, []);

  const startSession = useCallback(() => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      finish("unsupported");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = langRef.current;
    // Honoured on desktop; ignored on Android, where the `end` handler's
    // restart stands in for it.
    recognition.continuous = true;
    recognition.interimResults = true;

    // Per-session bookkeeping for the two Android quirks: a duplicated final
    // result, and a session that ends on an interim result with no final.
    let lastFinal = "";
    let lastInterim = "";
    let hadSpeech = false;
    let fatal: DictationFailure | null = null;
    let sawNoSpeech = false;

    const isCurrent = () => recognitionRef.current === recognition;

    recognition.onresult = (event) => {
      if (!isCurrent()) return;
      let interimChunk = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = (result[0]?.transcript ?? "").trim();
        if (!transcript) continue;
        if (result.isFinal) {
          // Android re-delivers the final result it just sent; only the first
          // copy reaches the page.
          if (transcript === lastFinal) continue;
          lastFinal = transcript;
          hadSpeech = true;
          lastInterim = "";
          onFinalRef.current(transcript);
        } else {
          interimChunk = interimChunk ? `${interimChunk} ${transcript}` : transcript;
        }
      }
      if (interimChunk) lastInterim = interimChunk;
      setInterim(interimChunk);
    };

    recognition.onerror = (event) => {
      if (!isCurrent()) return;
      const kind = classifySpeechError(event.error);
      if (kind === "aborted") return;
      if (kind === "no-speech") {
        sawNoSpeech = true;
        return;
      }
      fatal = kind;
    };

    recognition.onend = () => {
      if (!isCurrent()) return;
      detach(recognition);

      // Android can close the session on an interim result alone; that text
      // is the patient's and is kept rather than thrown away.
      if (!hadSpeech && lastInterim) {
        hadSpeech = true;
        onFinalRef.current(lastInterim);
      }

      if (fatal) {
        finish(fatal);
        if (fatal === "permission") {
          // Upgraded once the Permissions API has answered, unless the patient
          // has already moved on to something else.
          void refineNotAllowed().then((refined) =>
            setFailure((current) => (current === "permission" ? refined : current))
          );
        }
        return;
      }

      if (!activeRef.current) {
        finish(null);
        return;
      }

      silentSessionsRef.current = hadSpeech
        ? 0
        : sawNoSpeech
          ? silentSessionsRef.current + 1
          : silentSessionsRef.current;
      if (silentSessionsRef.current >= MAX_SILENT_SESSIONS) {
        silentSessionsRef.current = 0;
        finish("no-speech");
        return;
      }

      // Still wanted: on Android this is the whole of continuous mode, on
      // desktop it covers a session Chrome closed after a long pause.
      setInterim("");
      startSession();
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      detach(recognition);
      finish("unknown");
    }
  }, [detach, finish]);

  const start = useCallback(() => {
    if (activeRef.current) return;
    setFailure(null);

    if (!getSpeechRecognitionConstructor()) {
      finish("unsupported");
      return;
    }
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      finish("insecure-context");
      return;
    }

    activeRef.current = true;
    silentSessionsRef.current = 0;
    setListening(true);
    startSession();
  }, [finish, startSession]);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    // stop() lets the recogniser flush a final result before `end`; the `end`
    // handler then sees activeRef false and does not restart.
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (activeRef.current) stop();
    else start();
  }, [start, stop]);

  const clearFailure = useCallback(() => setFailure(null), []);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (recognition) {
        detach(recognition);
        recognition.abort();
      }
    };
  }, [detach]);

  return { supported, listening, interim, failure, start, stop, toggle, clearFailure };
}
