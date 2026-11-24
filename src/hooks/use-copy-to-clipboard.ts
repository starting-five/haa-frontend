"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// How long the control stays in its copied state before reverting, matching the
// 1500ms the link screen already used.
export const COPY_FEEDBACK_MS = 1500;

// The fallback chain the link screen worked out: the async clipboard first, then
// a hidden textarea for browsers that refuse it outside a user gesture. Callers
// that need a last resort pass onUnavailable — only the link screen does, and it
// prompts with the value so the ambassador can still copy by hand.
async function writeToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

interface UseCopyToClipboardOptions {
  resetMs?: number;
  // Called when both clipboard paths failed, so a screen can offer its own last resort.
  onUnavailable?: (text: string) => void;
}

/**
 * Copy → copied → copy. One implementation for every HAA-link copy control;
 * there were four before, three of which gave the ambassador no feedback at all.
 */
export function useCopyToClipboard({ resetMs = COPY_FEEDBACK_MS, onUnavailable }: UseCopyToClipboardOptions = {}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A control that unmounts while copied — a dialog closing, say — must not set
  // state afterwards.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      const succeeded = await writeToClipboard(text);

      if (!succeeded) {
        onUnavailable?.(text);
        return false;
      }

      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), resetMs);
      return true;
    },
    [onUnavailable, resetMs]
  );

  return { copied, copy };
}
