"use client";

import { useEffect, useRef, useState } from "react";

// WebOTP (https://wicg.github.io/web-otp/) lets a supported browser hand the page
// the code from an SMS the user has just received. The page never reads the
// inbox: the browser matches the message's trailing "@<origin> #<code>" line
// against the current origin and offers that one code, and only for a message
// that arrives while this request is open.
//
// Chrome on Android implements it. It needs a secure context, so it does not
// fire on the plain-HTTP test host, and it does not exist on desktop or iOS
// Safari at all. Everywhere it is missing the screen still works: the input
// keeps autocomplete="one-time-code", which is what drives iOS QuickType and
// Android's own autofill suggestion, and manual entry is untouched either way.

interface OtpCredentialRequestOptions extends CredentialRequestOptions {
  otp?: { transport: string[] };
}

interface OtpCredentialLike {
  code?: string;
}

export function isWebOtpSupported(): boolean {
  return (
    typeof window !== "undefined" && "OTPCredential" in window && typeof navigator?.credentials?.get === "function"
  );
}

interface UseWebOtpOptions {
  // the ambassador and patient screens both arm it, but only while there is a
  // code outstanding — re-arming after the field is full would leave a request
  // hanging for a message that is never coming
  enabled?: boolean;
  onDetect: (code: string) => void;
}

/**
 * Arms one WebOTP request for as long as `enabled` holds, and returns the code
 * the browser handed back, or null. The returned value is what the Patient Flow
 * "From Message" line reads; the callback is what fills the input.
 */
export function useWebOtp({ enabled = true, onDetect }: UseWebOtpOptions): string | null {
  const [detected, setDetected] = useState<string | null>(null);
  // the screens rebuild their handler every render, so holding it in a ref keeps
  // the effect from tearing the request down and re-arming it on each one
  const onDetectRef = useRef(onDetect);
  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  useEffect(() => {
    if (!enabled || !isWebOtpSupported()) return;

    const controller = new AbortController();
    let cancelled = false;

    const options: OtpCredentialRequestOptions = {
      otp: { transport: ["sms"] },
      signal: controller.signal,
    };

    navigator.credentials
      .get(options)
      .then((credential) => {
        const code = (credential as OtpCredentialLike | null)?.code;
        if (cancelled || !code) return;
        setDetected(code);
        onDetectRef.current(code);
      })
      .catch(() => {
        // Unmount aborts, a user dismissing the prompt and a platform that only
        // half-implements the API all land here. None of them is a failure the
        // patient should be told about — the field is still there to type into.
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled]);

  return detected;
}
