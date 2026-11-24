"use client";

import { useTranslations } from "next-intl";

// The incident-progress milestones, in the order the Figma tracker shows them
// once the case is reviewed (5366:15494, 5366:15849): the attorney's call comes
// before the doctor.
export const PROGRESS_STEPS = [
  "stepIntake",
  "stepAttorney",
  "stepAttorneyCall",
  "stepDoctor",
  "stepTreating",
  "stepSettled",
] as const;

export type ProgressStep = (typeof PROGRESS_STEPS)[number];

/**
 * Every step is in exactly one state, decided by its place against the current
 * step and by nothing else, so any step can be the current one:
 *
 *   completed  before the current step — a solid brand dot (Figma 5366:15849)
 *   active     the current step — the 17×16 ring: white centre, 2.5px brand
 *              border, whatever step it is
 *   upcoming   after it — a grey dot; Settled keeps its grey triangle
 */
export type ProgressStepState = "completed" | "active" | "upcoming";

export function progressStepState(step: ProgressStep, current: ProgressStep): ProgressStepState {
  const index = PROGRESS_STEPS.indexOf(step);
  const currentIndex = PROGRESS_STEPS.indexOf(current);
  if (index < currentIndex) return "completed";
  if (index === currentIndex) return "active";
  return "upcoming";
}

interface IncidentProgressProps {
  current: ProgressStep;
  // Figma 5366:15681 — while the case is in review the run to the current step
  // is drawn grey rather than brand.
  inReview: boolean;
  incidentDate: string | null;
}

/**
 * The dashboard's incident-progress band (progress-tracker-v3). The coloured
 * part of the track runs from Intake to the current step and stops there; the
 * stretch after it stays grey.
 */
export function IncidentProgress({ current, inReview, incidentDate }: IncidentProgressProps) {
  const t = useTranslations("IntakeDashboard");
  const currentIndex = PROGRESS_STEPS.indexOf(current);

  return (
    <section className="-mx-[23px] mt-[2px] flex flex-col gap-[7px] rounded-[12px] bg-white py-[16px] pl-[21px] pr-[16px] shadow-[0_4px_0.6px_0_rgba(0,0,0,0.02)]">
      <p
        className="pt-[4px] text-[12px] font-extrabold uppercase leading-none text-[#2d2d37]"
        style={{ fontFamily: "var(--font-inter)" }}
      >
        {t("incident")}
        {incidentDate ? ` ${incidentDate}` : ""}
      </p>

      <ol className="relative flex items-start justify-between">
        {/* track — Figma 5783:5481 sets six 54px columns edge to edge, so the
            first and last dot centres sit 27px in from each end; the coloured
            run ends under the current step */}
        <span
          aria-hidden="true"
          className="absolute left-[27px] right-[27px] top-[12px] h-[4px] rounded-[2px] bg-[#e5e4e9]"
        />
        <span
          aria-hidden="true"
          data-progress-run={inReview ? "review" : "brand"}
          className={`absolute left-[27px] top-[12px] h-[4px] rounded-[2px] ${
            inReview ? "bg-[#d9d9d9]" : "bg-[#cc007e]"
          }`}
          style={{ width: `calc((100% - 54px) * ${currentIndex / (PROGRESS_STEPS.length - 1)})` }}
        />

        {PROGRESS_STEPS.map((step) => {
          const state = progressStepState(step, current);
          // The design ends the run on a flag rather than a dot.
          const isFinal = step === PROGRESS_STEPS[PROGRESS_STEPS.length - 1];

          return (
            <li
              key={step}
              aria-current={state === "active" ? "step" : undefined}
              data-step-state={state}
              // 54px as drawn, narrower only when a small screen cannot fit six
              className="relative z-[1] flex w-[54px] min-w-0 shrink flex-col items-center gap-[8px]"
            >
              {/* marker — centred in a 27px box so every centre sits on the track */}
              <span className="flex size-[27px] items-center justify-center">
                {state === "active" ? (
                  <span className="h-[16px] w-[17px] rounded-full border-[2.5px] border-[#cc007e] bg-white shadow-[0_2px_4px_0_rgba(204,0,126,0.2)]" />
                ) : isFinal ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden="true"
                    className={state === "completed" ? "text-[#cc007e]" : "text-[#d9d9d9]"}
                  >
                    <path
                      d="M7 2.1 12.6 11.9H1.4L7 2.1Z"
                      fill="currentColor"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <span
                    className={`size-[12px] rounded-full ${state === "completed" ? "bg-[#cc007e]" : "bg-[#d9d9d9]"}`}
                  />
                )}
              </span>

              {/* every label is the same medium grey; the ring alone marks the step */}
              <span
                className="px-[1px] text-center text-[10px] font-medium leading-[13px] text-[#504b5a] min-[360px]:text-[11px]"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {t(step)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
