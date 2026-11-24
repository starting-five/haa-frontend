"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { NameScreen } from "@/components/name/name-screen";
import { usePreloadImages } from "@/hooks/use-preload-images";
import { releaseStaleIntake } from "@/lib/intake-owner";
import posthog from "posthog-js";

// The accident grid that follows shows all eight renders at once.
const NEXT_SCREEN_IMAGES = [
  "car",
  "motorcycle",
  "truck",
  "rideshare",
  "slip-fall",
  "pedestrian",
  "bicycle",
  "other",
].map((name) => `/assets/intake/incident/${name}.webp`);

export default function IntakeNamePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeName");

  usePreloadImages(NEXT_SCREEN_IMAGES);

  // Coming back shows the name entered before. Read in an effect so the server
  // render matches the first client one — reading during render filled the fields
  // in the browser but not on the server, and React threw the page away with a
  // hydration error. The screen mounts once the values are known so its own state
  // starts from them, as the phone screen's does.
  // The tab may still hold another account's intake — one deleted, or signed out
  // without the app's controls — so that is let go of first: a new patient on the
  // same number was shown the previous patient's name, and filed under it.
  const [initial, setInitial] = useState<{ firstName: string; lastName: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void releaseStaleIntake(sessionStorage).then(() => {
      if (cancelled) return;
      setInitial({
        firstName: sessionStorage.getItem("intake_firstName") ?? "",
        lastName: sessionStorage.getItem("intake_lastName") ?? "",
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleContinue = (firstName: string, lastName: string) => {
    posthog.capture("intake_name_submitted", {
      flow: "patient_intake",
      locale,
    });
    sessionStorage.setItem("intake_firstName", firstName);
    sessionStorage.setItem("intake_lastName", lastName);
    router.push(`/${locale}/intake/phone`);
  };

  if (!initial) return <div className="h-dvh w-full bg-white" />;

  return (
    <NameScreen
      heading={t("heading")}
      onContinue={handleContinue}
      initialFirstName={initial.firstName}
      initialLastName={initial.lastName}
    />
  );
}
