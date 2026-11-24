"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import Image from "next/image";
import { LocationInput } from "@/components/location-input";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { startIntake, type StartIntakeResult } from "@/services/intake";
import type { LocationDetails } from "@/types/location";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useEffect, useState } from "react";

const INCIDENT_LOCATION_DETAILS_KEY = "intake_incidentLocationDetails";

function readStoredLocationDetails(): LocationDetails | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(INCIDENT_LOCATION_DETAILS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocationDetails;
  } catch {
    return null;
  }
}

export default function IntakeLocationPage() {
  useRequireSessionKey("intake_incidentDate", "/intake/date");

  // A patient coming back sees the place they chose before. Read in an effect so
  // the server render matches the first client one: reading during render drew an
  // empty, invalid field on the server and a filled one in the browser, and React
  // discarded the page with a hydration error. The form mounts once the values are
  // known so its own state starts from them, as the phone screen's does.
  const [initial, setInitial] = useState<{ location: string; details: LocationDetails | null } | null>(null);
  useEffect(() => {
    setInitial({
      location: sessionStorage.getItem("intake_incidentLocation") ?? "",
      details: readStoredLocationDetails(),
    });
  }, []);

  if (!initial) return <div className="h-dvh w-full bg-white" />;

  return (
    <IncidentLocationForm
      initialLocation={initial.location}
      initialDetails={initial.details}
    />
  );
}

function IncidentLocationForm({
  initialLocation,
  initialDetails,
}: {
  initialLocation: string;
  initialDetails: LocationDetails | null;
}) {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeLocation");
  const tc = useTranslations("Common");
  const tSubmit = useTranslations("SubmitError");

  const [location, setLocation] = useState(initialLocation);
  const [isLocationValid, setIsLocationValid] = useState(Boolean(initialDetails && initialLocation.trim()));
  const [error, setError] = useState("");
  // Kept apart from the field error: one is about what was typed, the other
  // about the request, and they belong in different places on the screen.
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);

  /**
   * The last of the accident answers, so this is where they reach the case.
   *
   * The case itself was opened when the number was verified; this call carries
   * the accident onto it. It is the same endpoint either way — sending it twice
   * is how an intake that was abandoned and resumed has always been refreshed —
   * so a patient who comes back to this screen simply updates what is there.
   */
  const handleContinue = async () => {
    if (saving) return;
    if (!location.trim() || !isLocationValid) {
      posthog.capture("intake_location_validation_failed", {
        flow: "patient_intake",
        locale,
      });
      setError(t("required"));
      return;
    }

    // The incident screen wrote the crash type before any of the screens that lead
    // here. One missing means the session lost it, and the answer is to ask again —
    // never to send "other" in its place, which the case would carry as an answer.
    const incidentType = sessionStorage.getItem("intake_incidentType");
    if (!incidentType) {
      posthog.capture("intake_location_submission_redirected", {
        flow: "patient_intake",
        locale,
        reason: "missing_incident_type",
      });
      router.replace(`/${locale}/intake/incident`);
      return;
    }

    const incidentLocation = location.trim();
    sessionStorage.setItem("intake_incidentLocation", incidentLocation);

    setSaving(true);
    setSubmitError("");

    let result: StartIntakeResult;
    try {
      result = await startIntake({
        locale,
        claimant: {
          firstName: sessionStorage.getItem("intake_firstName") ?? "",
          lastName: sessionStorage.getItem("intake_lastName") ?? "",
          mobile: sessionStorage.getItem("intake_phone") ?? "",
          email: sessionStorage.getItem("intake_email") ?? undefined,
        },
        accident: {
          incidentType,
          incidentDate: sessionStorage.getItem("intake_incidentDate") ?? "",
          incidentLocation,
          incidentLocationDetails: readStoredLocationDetails(),
        },
      });
    } catch {
      posthog.capture("intake_accident_details_submit_failed", {
        flow: "patient_intake",
        locale,
      });
      setSaving(false);
      // The location stays on screen and in the session, so Continue can simply
      // be pressed again.
      setSubmitError(tSubmit("description"));
      return;
    }

    setSaving(false);

    // The case has been submitted since this tab opened it, so nothing was
    // written. Carrying on would collect answers that go nowhere; the patient's
    // dashboard is where that case now lives.
    if (result.existing) {
      posthog.capture("intake_existing_submission_routed_dashboard", {
        flow: "patient_intake",
        locale,
      });
      router.replace(`/${locale}/intake/dashboard`);
      return;
    }

    posthog.capture("intake_accident_details_submitted", {
      flow: "patient_intake",
      locale,
    });
    // The tab follows the case the backend actually wrote to.
    sessionStorage.setItem("intake_submissionId", result.submissionId);
    router.push(`/${locale}/intake/reassurance`);
  };

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      <form
        id="location-form"
        className="flex-1 overflow-y-auto px-[24px] pt-[32px]"
        onSubmit={(e) => {
          e.preventDefault();
          void handleContinue();
        }}
      >
        <h1
          className="text-[28px] font-extrabold text-[#111] leading-none mb-[24px]"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>

        {/* Illustration */}
        <div className="mb-[20px] mt-[8px] flex justify-center">
          <Image
            src="/assets/intake/location-pin.webp"
            alt=""
            width={260}
            height={270}
            priority
            unoptimized
            decoding="sync"
            className="h-[135px] w-[180px] object-contain"
          />
        </div>

        <LocationInput
          id="incidentLocation"
          label={t("label")}
          value={location}
          focusBorderColor="#CC007E"
          focusBorderWidth="1px"
          onValidityChange={setIsLocationValid}
          onLocationDetailsChange={(details) => {
            if (!details) {
              sessionStorage.removeItem(INCIDENT_LOCATION_DETAILS_KEY);
              return;
            }
            sessionStorage.setItem(INCIDENT_LOCATION_DETAILS_KEY, JSON.stringify(details));
          }}
          onChange={(v) => {
            setLocation(v);
            if (error) setError("");
            if (submitError) setSubmitError("");
          }}
          error={error}
          reserveErrorSpace={false}
          useCurrentLocationLabel={t("useCurrentLocation")}
          locationErrorMessage={t("locationError")}
        />
      </form>

      <ScreenFooter
        label={tc("continue")}
        formId="location-form"
        loading={saving}
        error={submitError}
        disabled={!location.trim() || !isLocationValid}
      />
    </div>
  );
}
