import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en.json";

// "Who was with you?" offers a companion's relation from one list that depends
// on the patient's own role: a patient who was the driver never sees "Driver"
// on the add-person form, nor when editing a saved person — and a person saved
// as a driver before that answer changed is asked for a valid relation again.

const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/intake/who-was-with-you",
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
  useSearchParams: () => searchParams,
}));
// the header this page renders builds a Supabase client and watches auth state
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);
vi.mock("@/hooks/use-require-session-key", () => ({ useRequireSessionKey: () => {} }));
vi.mock("@/hooks/use-preload-images", () => ({ usePreloadImages: () => {} }));

import WhoWasWithYouPage from "../page";

const t = messages.IntakeWhoWasWithYou;

const renderPage = () =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
    >
      <WhoWasWithYouPage />
    </NextIntlClientProvider>
  );

// The add-person form is reached by answering "Yes" on the opening choice.
const openAddPerson = async () => {
  fireEvent.click(await screen.findByRole("button", { name: t.yes }));
  await screen.findByText(`${t.theyWereLabel}:`);
};

const relationChips = () =>
  [t.relationPassenger, t.relationDriver, t.relationOther].filter((label) =>
    screen.queryByRole("button", { name: label })
  );

describe("who was with you — the Driver rule", () => {
  beforeEach(() => {
    push.mockClear();
    searchParams = new URLSearchParams();
    sessionStorage.clear();
  });

  it("does not offer Driver when the patient was the driver", async () => {
    sessionStorage.setItem("intake_role", "driver");
    renderPage();
    await openAddPerson();

    expect(relationChips()).toEqual([t.relationPassenger, t.relationOther]);
  });

  it("offers Driver for any other patient role", async () => {
    sessionStorage.setItem("intake_role", "passenger");
    renderPage();
    await openAddPerson();

    expect(relationChips()).toEqual([t.relationPassenger, t.relationDriver, t.relationOther]);
  });

  it("keeps Driver out of the edit form and clears a saved driver relation", async () => {
    sessionStorage.setItem("intake_role", "driver");
    sessionStorage.setItem("intake_who_was_with_you_answer", "yes");
    sessionStorage.setItem(
      "intake_who_was_with_you_people",
      JSON.stringify([{ firstName: "Mike", lastName: "Doe", relation: "driver", cellNumber: "", email: "" }])
    );
    renderPage();

    // The saved person is listed; open it for editing.
    fireEvent.click(await screen.findByRole("button", { name: t.edit }));
    await screen.findByText(`${t.theyWereLabel}:`);

    expect(relationChips()).toEqual([t.relationPassenger, t.relationOther]);
    // No chip is selected any more: the stale driver relation was cleared.
    for (const label of relationChips()) {
      expect(screen.getByRole("button", { name: label }).className).not.toMatch(/border-\[#cc007e\]/);
    }

    // Picking a valid relation selects it.
    fireEvent.click(screen.getByRole("button", { name: t.relationPassenger }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: t.relationPassenger }).className).toMatch(/border-\[#cc007e\]/)
    );
  });
});

// "Do this later" (Figma 2723:5420) is offered on the opening choice: it moves
// the patient on without answering the question either way.
describe("who was with you — Do this later", () => {
  beforeEach(() => {
    push.mockClear();
    searchParams = new URLSearchParams();
    sessionStorage.clear();
  });

  it("is offered on the opening choice", async () => {
    sessionStorage.setItem("intake_role", "passenger");
    renderPage();

    expect(await screen.findByRole("button", { name: t.doThisLater })).toBeInTheDocument();
  });

  it("continues without recording an answer or claiming the patient was alone", async () => {
    sessionStorage.setItem("intake_role", "passenger");
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: t.doThisLater }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/en/intake/protect-case");
    expect(sessionStorage.getItem("intake_who_was_with_you_answer")).toBeNull();
    expect(sessionStorage.getItem("intake_who_was_with_you_alone")).toBeNull();
  });

  it("is not shown once the patient is adding people", async () => {
    sessionStorage.setItem("intake_role", "passenger");
    renderPage();
    await openAddPerson();

    expect(screen.queryByRole("button", { name: t.doThisLater })).not.toBeInTheDocument();
  });
});

// The cell and email fields used to carry an example placeholder, which meant
// their label was pinned on at all times and the example vanished the moment the
// patient typed. Figma 2459:13897/14068/14142 wants the opposite: the field name
// is the placeholder while empty, and becomes a compact label above the value.
describe("who was with you — the person fields keep their label", () => {
  beforeEach(() => {
    push.mockClear();
    searchParams = new URLSearchParams();
    sessionStorage.clear();
  });

  const field = (id: string) => document.getElementById(id) as HTMLInputElement;
  const labelOf = (id: string) => field(id).closest("div.group")?.querySelector("span") ?? null;

  it("names the empty cell and email fields through their placeholder", async () => {
    renderPage();
    await openAddPerson();

    expect(field("companionCell").getAttribute("placeholder")).toBe(t.cellNumberLabel);
    expect(field("companionEmail").getAttribute("placeholder")).toBe(t.emailAddressLabel);
    expect(labelOf("companionCell")).toBeNull();
    expect(labelOf("companionEmail")).toBeNull();
  });

  it("keeps the label above the value once the cell number is entered", async () => {
    renderPage();
    await openAddPerson();

    fireEvent.change(field("companionCell"), { target: { value: "4155552233" } });

    const label = labelOf("companionCell");
    expect(label).not.toBeNull();
    expect(label).toHaveTextContent(t.cellNumberLabel);
    expect(field("companionCell").value).toBe("(415) 555-2233");
  });

  it("keeps the label above the value once the email is entered", async () => {
    renderPage();
    await openAddPerson();

    fireEvent.change(field("companionEmail"), { target: { value: "jane@example.com" } });

    expect(labelOf("companionEmail")).toHaveTextContent(t.emailAddressLabel);
  });

  it("never drops the label part-way through typing", async () => {
    renderPage();
    await openAddPerson();

    for (const partial of ["4", "41", "415555", "4155552233"]) {
      fireEvent.change(field("companionCell"), { target: { value: partial } });
      expect(labelOf("companionCell")).not.toBeNull();
    }
  });

  it("draws all four person fields in the regular floating-input frame", async () => {
    renderPage();
    await openAddPerson();

    for (const id of ["companionFirstName", "companionLastName", "companionCell", "companionEmail"]) {
      expect(field(id).closest("div.group")!.className).toMatch(/h-\[66px\]/);
    }
  });

  it("keeps Add Person disabled until a complete cell number is entered", async () => {
    renderPage();
    await openAddPerson();

    fireEvent.change(field("companionFirstName"), { target: { value: "Jane" } });
    fireEvent.click(screen.getByRole("button", { name: t.relationPassenger }));

    expect(screen.getByRole("button", { name: t.addPersonCta })).toBeDisabled();

    fireEvent.change(field("companionCell"), { target: { value: "4155552233" } });

    expect(screen.getByRole("button", { name: t.addPersonCta })).toBeEnabled();
  });

  it("shows a companion's full phone number on the review card", async () => {
    sessionStorage.setItem("intake_role", "passenger");
    sessionStorage.setItem("intake_who_was_with_you_answer", "yes");
    sessionStorage.setItem(
      "intake_who_was_with_you_people",
      JSON.stringify([
        {
          firstName: "Jane",
          lastName: "Doe",
          relation: "passenger",
          cellNumber: "(415) 555-2233",
          email: "",
        },
      ])
    );

    renderPage();

    expect(await screen.findByText("(415) 555-2233")).toBeInTheDocument();
    expect(screen.queryByText("(415) •••-2233")).not.toBeInTheDocument();
  });
});

describe("who was with you — manage mode", () => {
  beforeEach(() => {
    push.mockClear();
    searchParams = new URLSearchParams("manage=abc123");
    sessionStorage.clear();
  });

  it("returns to review when continuing from the people list", async () => {
    sessionStorage.setItem("intake_role", "passenger");
    sessionStorage.setItem("intake_who_was_with_you_answer", "yes");
    sessionStorage.setItem(
      "intake_who_was_with_you_people",
      JSON.stringify([{ firstName: "Jane", lastName: "Doe", relation: "passenger", cellNumber: "", email: "" }])
    );

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: t.continue }));

    expect(push).toHaveBeenCalledWith("/en/intake/review");
  });

  it("returns to review when canceling from the add-person form", async () => {
    sessionStorage.setItem("intake_role", "passenger");
    renderPage();
    await openAddPerson();

    fireEvent.click(screen.getByRole("button", { name: t.cancel }));

    expect(push).toHaveBeenCalledWith("/en/intake/review");
  });
});
