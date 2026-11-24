import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { FloatingInput } from "@/components/ui/floating-input";

// The Add/Edit person fields (Figma 2459:13897, 2459:14068, 2459:14142) show
// their name as a placeholder while empty, then lift it into a small uppercase
// label above the value. The value keeps its position throughout, so typing
// never reflows the field. Every other field in the app keeps the older
// treatment, which is why the behaviour is a variant rather than a rewrite.

function Controlled({
  variant,
  initial = "",
  ...rest
}: { variant?: "default" | "compact"; initial?: string } & Partial<React.ComponentProps<typeof FloatingInput>>) {
  const [value, setValue] = useState(initial);
  return (
    <FloatingInput
      id="field"
      label="Cell number"
      value={value}
      onChange={setValue}
      variant={variant}
      {...rest}
    />
  );
}

const input = () => document.getElementById("field") as HTMLInputElement;
const labelSpan = () => input().closest("div.group")?.querySelector("span") ?? null;
const box = () => input().closest("div.group") as HTMLElement;

describe("FloatingInput — compact variant", () => {
  it("shows the field name as the placeholder while empty, with no label above it", () => {
    render(<Controlled variant="compact" />);

    expect(labelSpan()).toBeNull();
    expect(input().getAttribute("placeholder")).toBe("Cell number");
  });

  it("lifts the label into the compact position once a value is entered", () => {
    render(<Controlled variant="compact" />);

    fireEvent.change(input(), { target: { value: "(415) 555-2233" } });

    const label = labelSpan();
    expect(label).not.toBeNull();
    expect(label).toHaveTextContent("Cell number");
    // 11/600 uppercase on 0.5 tracking in #a0a0a0 — Figma 2459:14142
    expect(label!.className).toMatch(/text-\[11px\]/);
    expect(label!.className).toMatch(/font-semibold/);
    expect(label!.className).toMatch(/uppercase/);
    expect(label!.className).toMatch(/tracking-\[0\.5px\]/);
    expect(label!.className).toMatch(/text-\[#a0a0a0\]/);
  });

  it("keeps the label visible for every keystroke, never dropping it mid-typing", () => {
    render(<Controlled variant="compact" />);

    for (const partial of ["4", "41", "415", "(415) 5", "(415) 555-2233"]) {
      fireEvent.change(input(), { target: { value: partial } });
      expect(labelSpan()).not.toBeNull();
    }

    // and it goes away again only when the field is genuinely emptied
    fireEvent.change(input(), { target: { value: "" } });
    expect(labelSpan()).toBeNull();
  });

  it("holds the value on the same line empty or filled, so nothing reflows", () => {
    render(<Controlled variant="compact" />);
    // asserted on the class, not computed style: jsdom loads no stylesheet, so a
    // computed paddingTop is "" in both states and would pass either way
    expect(input().className).toMatch(/pt-\[24px\]/);
    const emptyClasses = input().className;

    fireEvent.change(input(), { target: { value: "(415) 555-2233" } });

    expect(input().className).toMatch(/pt-\[24px\]/);
    expect(input().className).toBe(emptyClasses);
    expect(box().className).toMatch(/h-\[64px\]/);
  });

  it("stays a true floating label even when an example placeholder is supplied", () => {
    // the older mode pinned the label on whenever a placeholder existed; compact
    // must not, or the empty field shows its name twice
    render(
      <Controlled
        variant="compact"
        placeholder="(407) 555-1234"
      />
    );

    expect(labelSpan()).toBeNull();

    fireEvent.change(input(), { target: { value: "(415) 555-2233" } });
    expect(labelSpan()).not.toBeNull();
  });

  it("draws the frame's value type", () => {
    render(
      <Controlled
        variant="compact"
        initial="(415) 555-2233"
      />
    );

    expect(input().className).toMatch(/text-\[15px\]/);
    expect(input().className).toMatch(/font-medium/);
    expect(input().className).toMatch(/text-\[#1c1c1e\]/);
  });

  it("uses the frame's error red on the edge and the message", () => {
    render(
      <Controlled
        variant="compact"
        error="Enter their name"
        reserveErrorSpace={false}
      />
    );

    const edge = box().querySelector("[aria-hidden]") as HTMLElement;
    expect(edge.className).toMatch(/border-\[#ff3b30\]/);

    const message = screen.getByRole("alert");
    expect(message).toHaveTextContent("Enter their name");
    expect(message.className).toMatch(/text-\[#ff3b30\]/);
    expect(message.className).toMatch(/font-medium/);
  });
});

describe("FloatingInput — default variant is untouched", () => {
  it("keeps the 66px box and 16px value the rest of the app uses", () => {
    render(<Controlled initial="Mike" />);

    expect(box().className).toMatch(/h-\[66px\]/);
    expect(input().className).toMatch(/text-\[16px\]/);
    expect(box().className).not.toMatch(/h-\[64px\]/);
  });

  it("still shows its label only once a value exists, in the older type", () => {
    render(<Controlled />);
    expect(labelSpan()).toBeNull();

    fireEvent.change(input(), { target: { value: "Mike" } });

    const label = labelSpan();
    expect(label).not.toBeNull();
    expect(label!.className).toMatch(/text-\[14px\]/);
    expect(label!.className).not.toMatch(/uppercase/);
  });

  it("keeps a field with its own example text showing both, as before", () => {
    render(
      <Controlled
        placeholder="(407) 555-1234"
        label="Cell Number"
      />
    );

    // the older always-on label mode, which the person fields no longer use
    expect(labelSpan()).not.toBeNull();
    expect(input().getAttribute("placeholder")).toBe("(407) 555-1234");
  });
});
