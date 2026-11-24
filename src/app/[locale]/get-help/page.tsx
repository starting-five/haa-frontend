"use client";

import { PreferredLanguageCards } from "@/components/language/preferred-language-cards";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { usePreloadImages } from "@/hooks/use-preload-images";
import { LOCALES } from "@/i18n/locales";
import { STEP_SELECTION_ADVANCE_DELAY_MS } from "@/lib/constants";
import posthog from "posthog-js";
import { useEffect, useRef, useState } from "react";

// The splash that follows opens on the brand character.
const NEXT_SCREEN_IMAGES = ["/assets/intake/haa-splash.webp"] as const;
const LANGUAGE_SELECTION_STORAGE_KEY = "getHelp:selectedLocale";

function buildSplashPath(locale: string) {
  return `/${locale}/intake/help-is-on-the-way?entry=${Date.now()}`;
}

function safeGetSavedLocale() {
  try {
    return sessionStorage.getItem(LANGUAGE_SELECTION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeSetSavedLocale(locale: string) {
  try {
    sessionStorage.setItem(LANGUAGE_SELECTION_STORAGE_KEY, locale);
  } catch {
    // Ignore storage failures (e.g. private mode restrictions).
  }
}

function isBackOrForwardNavigation() {
  try {
    const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    return entry?.type === "back_forward";
  } catch {
    return false;
  }
}

export default function GetHelpPage() {
  const [pendingLocale, setPendingLocale] = useState<string | null>(null);
  const navigateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  usePreloadImages(NEXT_SCREEN_IMAGES);

  useEffect(() => {
    if (!isBackOrForwardNavigation()) {
      return;
    }
    const savedLocale = safeGetSavedLocale();
    if (!savedLocale) {
      return;
    }
    const isSupportedLocale = LOCALES.some((locale) => locale.code === savedLocale);
    if (isSupportedLocale) {
      setPendingLocale(savedLocale);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (navigateTimeoutRef.current) {
        clearTimeout(navigateTimeoutRef.current);
      }
    };
  }, []);

  const handleSelectLocale = (code: string) => {
    if (navigateTimeoutRef.current) {
      clearTimeout(navigateTimeoutRef.current);
    }
    posthog.capture("intake_language_selected", {
      flow: "patient_intake",
      locale: code,
    });
    setPendingLocale(code);
    safeSetSavedLocale(code);
    const splashPath = buildSplashPath(code);
    navigateTimeoutRef.current = setTimeout(() => {
      navigateTimeoutRef.current = null;
      window.location.assign(splashPath);
    }, STEP_SELECTION_ADVANCE_DELAY_MS);
  };

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      {/* Figma 3425:6366 / 1933:2119 — logo only. The frame still draws a back
          chevron, but the Patient Flow offers no back action on any screen. Both
          cards carry the same neutral hairline: the frame no longer marks the
          current language with the brand border. */}
      <ScreenHeader
        showLanguageSelector={false}
        showCallButton={false}
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-[24px]">
        <PreferredLanguageCards
          selectedLocale={pendingLocale ?? ""}
          onSelectLocale={handleSelectLocale}
        />
      </div>
    </div>
  );
}
