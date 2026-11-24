import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import es from "../../../../messages/es.json";
import {
  IncidentProgress,
  PROGRESS_STEPS,
  progressStepState,
  type ProgressStep,
} from "@/components/intake/incident-progress";

// The dashboard's progress band, with each of its six steps made the current
// one: the steps before it are solid brand dots, the current one is the white
// ring with a brand border (Figma 5366:15849's Attorney call, whatever the
// step), the ones after it grey, and the brand run stops under the current step.

const renderAt = (current: ProgressStep, { inReview = false, locale = "en" as "en" | "es" } = {}) =>
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "es" ? es : en}
    >
      <IncidentProgress
        current={current}
        inReview={inReview}
        incidentDate="9/8/26"
      />
    </NextIntlClientProvider>
  );

const steps = (container: HTMLElement) => [...container.querySelectorAll("ol > li")] as HTMLElement[];
const marker = (li: HTMLElement) => li.firstElementChild!.firstElementChild as HTMLElement | SVGElement;
const markerClass = (li: HTMLElement) => marker(li).getAttribute("class") ?? "";
const run = (container: HTMLElement) => container.querySelectorAll("ol > span")[1] as HTMLElement;

const RING = ["h-[16px]", "w-[17px]", "rounded-full", "border-[2.5px]", "border-[#cc007e]", "bg-white"];

const expectActive = (li: HTMLElement) => {
  expect(li).toHaveAttribute("data-step-state", "active");
  expect(li).toHaveAttribute("aria-current", "step");
  for (const token of RING) expect(markerClass(li)).toContain(token);
  // a white centre, never a filled brand dot
  expect(markerClass(li)).not.toContain("bg-[#cc007e]");
};
const expectCompleted = (li: HTMLElement) => {
  expect(li).toHaveAttribute("data-step-state", "completed");
  expect(li).not.toHaveAttribute("aria-current");
  expect(markerClass(li)).toMatch(/bg-\[#cc007e\]|text-\[#cc007e\]/);
  expect(markerClass(li)).not.toContain("bg-white");
};
const expectUpcoming = (li: HTMLElement) => {
  expect(li).toHaveAttribute("data-step-state", "upcoming");
  expect(li).not.toHaveAttribute("aria-current");
  expect(markerClass(li)).toMatch(/bg-\[#d9d9d9\]|text-\[#d9d9d9\]/);
  expect(markerClass(li)).not.toContain("#cc007e");
};

describe("IncidentProgress", () => {
  it("runs Intake, Attorney, Attorney call, Doctor, Treating, Settled", () => {
    const { container } = renderAt("stepAttorney");
    expect(steps(container).map((li) => li.textContent)).toEqual([
      en.IntakeDashboard.stepIntake,
      en.IntakeDashboard.stepAttorney,
      en.IntakeDashboard.stepAttorneyCall,
      en.IntakeDashboard.stepDoctor,
      en.IntakeDashboard.stepTreating,
      en.IntakeDashboard.stepSettled,
    ]);
  });

  it.each(PROGRESS_STEPS.map((step, index) => [step, index] as const))(
    "with %s current: earlier steps solid brand, it the white ring, later steps grey",
    (current, currentIndex) => {
      const { container } = renderAt(current);
      const all = steps(container);

      all.forEach((li, index) => {
        if (index < currentIndex) expectCompleted(li);
        else if (index === currentIndex) expectActive(li);
        else expectUpcoming(li);
      });
      expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1);

      // the brand run ends exactly under the current step: currentIndex of the
      // five stretches between six steps, and no further
      expect(run(container).className).toContain("bg-[#cc007e]");
      expect(run(container).style.width).toBe(`calc(${currentIndex / 5} * (100% - 54px))`);
    }
  );

  it("keeps Settled's triangle: grey ahead of it, brand once it is passed", () => {
    const ahead = renderAt("stepTreating");
    const settledAhead = steps(ahead.container)[5];
    expect(marker(settledAhead).tagName.toLowerCase()).toBe("svg");
    expectUpcoming(settledAhead);
    ahead.unmount();

    // Settled current is the end of the run: everything before it is done
    const reached = renderAt("stepSettled");
    const all = steps(reached.container);
    all.slice(0, 5).forEach(expectCompleted);
    expectActive(all[5]);
  });

  it("draws the run grey while the case is in review, the ring and dots unchanged", () => {
    const { container } = renderAt("stepAttorney", { inReview: true });
    expect(run(container).className).toContain("bg-[#d9d9d9]");
    expect(run(container).className).not.toContain("bg-[#cc007e]");
    const all = steps(container);
    expectCompleted(all[0]);
    expectActive(all[1]);
    all.slice(2).forEach(expectUpcoming);
  });

  it("is in Spanish, with the same states", () => {
    const { container } = renderAt("stepAttorneyCall", { locale: "es" });
    const all = steps(container);
    expect(all[2]).toHaveTextContent(es.IntakeDashboard.stepAttorneyCall);
    expectActive(all[2]);
    expectCompleted(all[1]);
    expectUpcoming(all[3]);
    expect(container).toHaveTextContent(`${es.IntakeDashboard.incident} 9/8/26`);
  });

  it("decides each state from position alone", () => {
    expect(progressStepState("stepIntake", "stepAttorneyCall")).toBe("completed");
    expect(progressStepState("stepAttorney", "stepAttorneyCall")).toBe("completed");
    expect(progressStepState("stepAttorneyCall", "stepAttorneyCall")).toBe("active");
    expect(progressStepState("stepDoctor", "stepAttorneyCall")).toBe("upcoming");
    expect(progressStepState("stepSettled", "stepAttorneyCall")).toBe("upcoming");
    expect(progressStepState("stepIntake", "stepIntake")).toBe("active");
  });
});
