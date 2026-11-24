"use client";

import { PreferredLanguageCards } from "@/components/language/preferred-language-cards";
import { ScreenHeader } from "@/components/layout/screen-header";
import { LOCALES } from "@/i18n/locales";
import { STEP_SELECTION_ADVANCE_DELAY_MS } from "@/lib/constants";
import { useEffect, useRef, useState } from "react";

const LANGUAGE_SELECTION_STORAGE_KEY = "ambassadorsLanguage:selectedLocale";

function isBackOrForwardNavigation() {
  try {
    const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    return entry?.type === "back_forward";
  } catch {
    return false;
  }
}

export default function AmbassadorsLanguageSelectorPage() {
  const [pendingLocale, setPendingLocale] = useState<string | null>(null);
  const navigateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
    };
  }, []);

  useEffect(() => {
    if (!isBackOrForwardNavigation()) {
      return;
    }
    const savedLocale = sessionStorage.getItem(LANGUAGE_SELECTION_STORAGE_KEY);
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
    setPendingLocale(code);
    sessionStorage.setItem(LANGUAGE_SELECTION_STORAGE_KEY, code);
    navigateTimeoutRef.current = setTimeout(() => {
      navigateTimeoutRef.current = null;
      window.location.assign(`/${code}/ambassadors/get-started`);
    }, STEP_SELECTION_ADVANCE_DELAY_MS);
  };

  return (
    <div className="h-dvh max-h-dvh flex flex-col max-w-[393px] mx-auto overflow-hidden overscroll-none bg-white">
      <ScreenHeader
        showLanguageSelector={false}
        showCallButton={false}
      />

      <div className="flex flex-1 min-h-0 items-center justify-center px-[24px]">
        <div className="w-full">
          <PreferredLanguageCards
            selectedLocale={pendingLocale ?? ""}
            onSelectLocale={handleSelectLocale}
          />
        </div>
      </div>
    </div>
  );
}
