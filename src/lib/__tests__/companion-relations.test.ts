import { describe, expect, it } from "vitest";
import { COMPANION_RELATIONS, companionRelationsFor } from "@/lib/companion-relations";

// The Driver rule: once the patient has said they were the driver (Figma
// 1949:3653), no companion can be "the driver" on the add-person and
// edit-person screens (2459:13860, 2459:14142). Other roles keep every option.
describe("companionRelationsFor", () => {
  it("drops driver from the list when the patient was the driver", () => {
    expect(companionRelationsFor("driver")).toEqual(["passenger", "other"]);
  });

  it("offers every relation for any other patient role", () => {
    for (const role of ["passenger", "pedestrian", "bicyclist"]) {
      expect(companionRelationsFor(role)).toEqual([...COMPANION_RELATIONS]);
    }
  });

  it("offers every relation when no role is stored yet", () => {
    expect(companionRelationsFor(null)).toEqual([...COMPANION_RELATIONS]);
    expect(companionRelationsFor(undefined)).toEqual([...COMPANION_RELATIONS]);
  });
});
