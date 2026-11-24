import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ScreenFooter } from "../screen-footer";

// The primary button is optional: a screen whose way forward only exists once
// something has happened on it leaves the label out, and the footer then shows
// no primary button at all — not an empty one.
describe("ScreenFooter", () => {
  it("draws the primary button when it is given a label", () => {
    const onClick = vi.fn();
    render(
      <ScreenFooter
        label="Continue"
        onClick={onClick}
        secondaryLabel="Cancel"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("draws no primary button without a label, and keeps the secondary one", () => {
    const onSecondaryClick = vi.fn();
    render(
      <ScreenFooter
        secondaryLabel="Cancel"
        onSecondaryClick={onSecondaryClick}
      />
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent("Cancel");
    fireEvent.click(buttons[0]);
    expect(onSecondaryClick).toHaveBeenCalledTimes(1);
  });
});
