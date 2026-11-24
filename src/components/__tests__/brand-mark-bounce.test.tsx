import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import tailwindConfig from "../../../tailwind.config";
import { BrandMarkBounce } from "../brand-mark-bounce";

// Every interstitial brand mark is wrapped in this, so what it applies is the
// motion contract for the Patient Flow and the Brand Ambassador screens alike:
// the design's haa-bounce loop, switched off when reduced motion is requested.

const renderMark = () =>
  render(
    <BrandMarkBounce>
      <span>mark</span>
    </BrandMarkBounce>
  );

describe("BrandMarkBounce", () => {
  it("bounces the mark it wraps on the shared haa-bounce loop", () => {
    renderMark();

    expect(screen.getByText("mark").parentElement).toHaveClass("animate-haa-bounce");
  });

  it("stops the bounce when the system asks for reduced motion", () => {
    renderMark();

    expect(screen.getByText("mark").parentElement).toHaveClass("motion-reduce:animate-none");
  });

  it("keeps the design's rise-and-settle keyframes and timing", () => {
    const extend = tailwindConfig.theme?.extend as {
      animation: Record<string, string>;
      keyframes: Record<string, unknown>;
    };

    expect(extend.animation["haa-bounce"]).toBe("haa-bounce 2s infinite");
    expect(extend.keyframes["haa-bounce"]).toEqual({
      "0%": { transform: "translate3d(0, 0, 0)", animationTimingFunction: "ease-out" },
      "37.5%": { transform: "translate3d(0, -12px, 0)", animationTimingFunction: "ease-in" },
      "75%": { transform: "translate3d(0, 0, 0)", animationTimingFunction: "linear" },
      "100%": { transform: "translate3d(0, 0, 0)" },
    });
  });
});
