"use client";

import posthog from "posthog-js";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

function toStepSlug(pathname: string): { locale: string; step: string } | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  const [locale, section, page] = segments;
  if (!locale) return null;

  if (section === "get-help") {
    return { locale, step: "language_selector" };
  }

  if (section !== "intake") return null;

  if (!page) return { locale, step: "name" };

  return { locale, step: page.replace(/-/g, "_") };
}

export function IntakeFlowTracker() {
  const pathname = usePathname();
  const lastTrackedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (lastTrackedPathRef.current === pathname) return;

    const step = toStepSlug(pathname);
    if (!step) return;

    lastTrackedPathRef.current = pathname;
    posthog.capture("intake_step_viewed", {
      flow: "patient_intake",
      locale: step.locale,
      step: step.step,
      path: pathname,
    });
  }, [pathname]);

  return null;
}

