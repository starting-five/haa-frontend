import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useRequireSessionKey } from "../use-require-session-key";
import { INTAKE_SUBMITTED_KEY } from "@/lib/intake-session";

// The guard has two jobs: keep a raw URL out of the middle of intake, and —
// once the case is submitted and the answers are gone — keep the browser's
// Back from walking the patient down the cascade of fallbacks to the first
// unguarded screen. The second is what these pin.

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));

function Guarded() {
  useRequireSessionKey("intake_treatmentArea", "/intake/treatment-area");
  return null;
}

describe("useRequireSessionKey", () => {
  beforeEach(() => {
    replace.mockClear();
    sessionStorage.clear();
  });

  it("lets a screen render when its prerequisite is stored", () => {
    sessionStorage.setItem("intake_treatmentArea", "Los Angeles, CA");

    render(<Guarded />);

    expect(replace).not.toHaveBeenCalled();
  });

  it("sends an unfinished flow back to the missing step", () => {
    render(<Guarded />);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/en/intake/treatment-area");
  });

  it("forwards a submitted case to the dashboard instead of the step before", () => {
    sessionStorage.setItem("intake_submissionId", "eee0b2d0-2362-494c-a890-eb1e9931fe33");
    sessionStorage.setItem(INTAKE_SUBMITTED_KEY, "1");

    render(<Guarded />);

    // The dashboard, not attorney matching: a submitted case waits there for
    // review, and only an accepted one is sent on to sign.
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/en/intake/dashboard");
  });

  it("ignores a submitted marker that has no submission id behind it", () => {
    sessionStorage.setItem(INTAKE_SUBMITTED_KEY, "1");

    render(<Guarded />);

    expect(replace).toHaveBeenCalledWith("/en/intake/treatment-area");
  });
});
