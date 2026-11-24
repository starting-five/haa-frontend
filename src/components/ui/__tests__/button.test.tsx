import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "../button";

describe("Button", () => {
  it("renders button content", () => {
    render(<Button>Continue</Button>);

    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("handles click events", () => {
    const onClick = vi.fn();

    render(<Button onClick={onClick}>Continue</Button>);
    fireEvent.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("supports disabled state", () => {
    render(<Button disabled>Continue</Button>);

    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("applies variants", () => {
    render(<Button variant="destructive">Delete</Button>);

    expect(screen.getByRole("button")).toHaveClass("bg-destructive");
  });
});
