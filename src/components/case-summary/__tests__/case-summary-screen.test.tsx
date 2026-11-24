import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import es from "../../../../messages/es.json";
import { installGooglePlacesMock, removeGooglePlacesMock, SPRINGFIELD_62704 } from "@/test-utils/google-places-mock";

// Case Summary edits a draft of the patient's submitted case and sends only
// what changed to POST /case/:submissionId when Save is pressed. Email and
// phone are shown and locked; a case the admin has decided is read-only; and
// edits that are not saved are not lost to a stray tap.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/case/s-1",
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));
// the header this screen renders builds a Supabase client and watches auth state
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);

const save = vi.hoisted(() => vi.fn());
vi.mock("@/services/intake", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/intake")>();
  return { ...actual, saveCaseSummary: save };
});

import { CaseSummarySaveError, type CaseSummary } from "@/services/intake";
import { CaseSummaryScreen } from "../case-summary-screen";

const SPRINGFIELD = "Springfield, IL 62704";

const summaryWith = (overrides: Partial<CaseSummary> = {}): CaseSummary => ({
  submissionId: "s-1",
  status: "submitted",
  submittedAt: "2026-09-08T12:00:00.000Z",
  firstName: "Jessica",
  lastName: "Hale",
  phone: "+15551230888",
  email: "jessica@example.test",
  incidentType: "car",
  incidentDate: "2026-09-05",
  incidentLocation: SPRINGFIELD,
  incidentLocationDetails: {
    text: SPRINGFIELD,
    placeId: SPRINGFIELD_62704.id,
    city: "Springfield",
    state: "IL",
    postalCode: "62704",
    source: "autosuggest",
    precision: "address",
  },
  role: "driver",
  injuries: "back,upperBody,Left wrist",
  treatmentArea: "Orlando, FL 32801",
  treatmentAreaLocationDetails: null,
  companions: [{ firstName: "Lena", lastName: "Hale", relation: "spouse" }],
  documents: [{ id: "d-1", fileName: "police-report.pdf", mimeType: "application/pdf", category: null }],
  editable: true,
  ...overrides,
});

const renderScreen = (summary: CaseSummary = summaryWith(), locale: "en" | "es" = "en") =>
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "es" ? es : en}
    >
      <CaseSummaryScreen
        locale={locale}
        initialSummary={summary}
      />
    </NextIntlClientProvider>
  );

const t = en.CaseSummary;
const tr = en.IntakeReview;
const saveButton = () => screen.getByRole("button", { name: t.save }) as HTMLButtonElement;
const openName = () => fireEvent.click(screen.getByRole("button", { name: tr.editNameTitle }));
const sheetSave = () => screen.getByRole("button", { name: tr.saveChanges });

/** A click on an in-app link, as the header's menu and logo are; returns whether the screen stopped it. */
const clickLink = (href: string) => {
  const link = document.createElement("a");
  link.href = href;
  link.textContent = "Elsewhere";
  document.body.appendChild(link);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
  act(() => {
    link.dispatchEvent(click);
  });
  link.remove();
  return click.defaultPrevented;
};

const editInjuries = () => {
  fireEvent.click(screen.getByRole("button", { name: tr.editInjuriesTitle }));
  fireEvent.click(screen.getByRole("button", { name: en.IntakeInjury.headNeck }));
  fireEvent.click(sheetSave());
};

describe("Case Summary", () => {
  beforeEach(() => {
    push.mockReset();
    save.mockReset();
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-key");
    installGooglePlacesMock({ suggestions: [SPRINGFIELD_62704] });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    removeGooglePlacesMock();
  });

  it("shows the stored case, with a magenta Save at the bottom and no back link", () => {
    renderScreen();

    expect(screen.getByRole("heading", { name: t.heading })).toBeInTheDocument();
    expect(screen.getByText("Jessica Hale")).toBeInTheDocument();
    expect(screen.getByText("+15551230888")).toBeInTheDocument();
    expect(screen.getByText("jessica@example.test")).toBeInTheDocument();
    expect(screen.getByText(/Sep 5, 2026/)).toBeInTheDocument();
    expect(screen.getByText(`${en.IntakeInjury.back} · ${en.IntakeInjury.upperBody} · Left wrist`)).toBeInTheDocument();
    expect(screen.getByText("police-report.pdf")).toBeInTheDocument();

    const button = saveButton();
    expect(button).toBeEnabled();
    expect(button.className).toContain("bg-brand");
    expect(screen.queryByRole("button", { name: /dashboard/i })).toBeNull();
    // the footer is the last thing on the screen, after every section
    const main = screen.getByRole("main");
    expect(main.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main.contains(button)).toBe(false);
  });

  it("saves only the section that changed, then returns to the dashboard", async () => {
    save.mockImplementation(async () => summaryWith({ injuries: "back,upperBody,headNeck,Left wrist" }));
    renderScreen();

    editInjuries();
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    // the typed injury the editor cannot show is kept, not dropped
    expect(save).toHaveBeenCalledWith("s-1", { injuries: "back,upperBody,headNeck,Left wrist" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/intake/dashboard"));
    // stored before leaving, so the way out is not taken for an unsaved edit
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("returns to the dashboard without a request when nothing changed", () => {
    renderScreen();
    fireEvent.click(saveButton());

    expect(push).toHaveBeenCalledWith("/en/intake/dashboard");
    expect(save).not.toHaveBeenCalled();
  });

  it("saves a name change without email or phone in the request", async () => {
    save.mockImplementation(async () => summaryWith({ firstName: "Jess" }));
    renderScreen();

    openName();
    fireEvent.change(document.getElementById("review-first-name") as HTMLInputElement, { target: { value: "Jess" } });
    fireEvent.click(sheetSave());
    fireEvent.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const [, payload] = save.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).toEqual({ claimant: { firstName: "Jess", lastName: "Hale" } });
    expect(JSON.stringify(payload)).not.toMatch(/email|phone|mobile/i);
  });

  it("stays, keeps the edit and says so when Save fails; a retry saves and leaves", async () => {
    save.mockRejectedValueOnce(new CaseSummarySaveError("request_failed_500"));
    renderScreen();

    editInjuries();
    fireEvent.click(saveButton());

    expect(await screen.findByText(t.saveError)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        `${en.IntakeInjury.back} · ${en.IntakeInjury.upperBody} · ${en.IntakeInjury.headNeck} · Left wrist`
      )
    ).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();

    save.mockResolvedValueOnce(summaryWith({ injuries: "back,upperBody,headNeck,Left wrist" }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/intake/dashboard"));
  });

  it("sends a single save while one is in flight", async () => {
    let finish: (value: CaseSummary) => void = () => {};
    save.mockImplementation(() => new Promise<CaseSummary>((resolve) => (finish = resolve)));
    renderScreen();

    editInjuries();
    fireEvent.click(saveButton());
    const busy = screen.getByRole("button", { name: t.saving });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    await act(async () => finish(summaryWith({ injuries: "back,upperBody,headNeck,Left wrist" })));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("turns read-only when the backend no longer accepts edits to the case", async () => {
    save.mockRejectedValueOnce(new CaseSummarySaveError("case_locked"));
    renderScreen();

    editInjuries();
    fireEvent.click(saveButton());

    expect(await screen.findByText(t.lockedOnSave)).toBeInTheDocument();
    // a refused save stays on the screen, with the reason, rather than leaving
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByTestId("case-summary-locked")).toHaveTextContent(t.lockedNotice);
    expect(screen.queryByRole("button", { name: t.save })).toBeNull();
    expect(screen.queryByRole("button", { name: tr.editInjuriesTitle })).toBeNull();
    // the unsaved edit is gone, not shown as if it were stored
    expect(screen.getByText(`${en.IntakeInjury.back} · ${en.IntakeInjury.upperBody} · Left wrist`)).toBeInTheDocument();
  });

  it("edits a signed case like any other: pencils and Save, status untouched by the screen", async () => {
    save.mockImplementation(async () =>
      summaryWith({ status: "signed", injuries: "back,upperBody,headNeck,Left wrist" })
    );
    renderScreen(summaryWith({ status: "signed", editable: true }));

    expect(screen.queryByTestId("case-summary-locked")).toBeNull();
    for (const name of [tr.editNameTitle, tr.editAccidentTitle, tr.editInjuriesTitle, tr.editRecoveryTitle]) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
    editInjuries();
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledWith("s-1", { injuries: "back,upperBody,headNeck,Left wrist" }));
    expect(JSON.stringify(save.mock.calls[0])).not.toContain("status");
  });

  it("is read-only when the backend says the case cannot be edited: no pencils, no Save, a reason", () => {
    renderScreen(summaryWith({ status: "intake", editable: false }));

    expect(screen.getByTestId("case-summary-locked")).toHaveTextContent(t.lockedNotice);
    expect(screen.queryByRole("button", { name: t.save })).toBeNull();
    for (const name of [tr.editNameTitle, tr.editAccidentTitle, tr.editInjuriesTitle, tr.editRecoveryTitle]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.getByText("Jessica Hale")).toBeInTheDocument();
  });
});

describe("Case Summary — personal information", () => {
  beforeEach(() => {
    push.mockReset();
    save.mockReset();
  });

  it("opens the pencil with the name editable and phone and email locked", () => {
    renderScreen();
    openName();

    const firstName = document.getElementById("review-first-name") as HTMLInputElement;
    const lastName = document.getElementById("review-last-name") as HTMLInputElement;
    expect(firstName).toBeEnabled();
    expect(firstName.readOnly).toBe(false);
    expect(lastName).toBeEnabled();

    const phone = screen.getByLabelText(t.phoneLabel) as HTMLInputElement;
    const email = screen.getByLabelText(t.emailLabel) as HTMLInputElement;
    for (const field of [phone, email]) {
      expect(field).toBeDisabled();
      expect(field.readOnly).toBe(true);
      expect(field).toHaveAttribute("aria-readonly", "true");
      // the reason is announced with the field, not only shown beside it
      expect(field.getAttribute("aria-describedby")).toBe("case-summary-contact-locked");
    }
    expect(phone.value).toBe("+15551230888");
    expect(email.value).toBe("jessica@example.test");
    expect(screen.getByText(t.contactLocked)).toBeInTheDocument();
  });

  it("keeps phone and email out of reach of the keyboard", () => {
    renderScreen();
    openName();

    const phone = screen.getByLabelText(t.phoneLabel) as HTMLInputElement;
    const email = screen.getByLabelText(t.emailLabel) as HTMLInputElement;
    phone.focus();
    expect(document.activeElement).not.toBe(phone);
    email.focus();
    expect(document.activeElement).not.toBe(email);
    // typing into them changes nothing
    fireEvent.change(phone, { target: { value: "+15550000000" } });
    expect(phone.value).toBe("+15551230888");
  });

  it("shows a missing email as not provided, still locked", () => {
    renderScreen(summaryWith({ email: null }));
    openName();

    const email = screen.getByLabelText(t.emailLabel) as HTMLInputElement;
    expect(email.value).toBe(t.notProvided);
    expect(email).toBeDisabled();
  });

  it("refuses characters the backend would refuse, in the sheet", () => {
    renderScreen();
    openName();

    fireEvent.change(document.getElementById("review-first-name") as HTMLInputElement, { target: { value: "Jess1" } });
    fireEvent.click(sheetSave());

    expect(screen.getByRole("alert")).toHaveTextContent(en.NameScreen.invalidName);
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText("Jessica Hale")).toBeInTheDocument();
  });

  it("leaves the other sections editable", () => {
    renderScreen();

    for (const name of [tr.editAccidentTitle, tr.editInjuriesTitle, tr.editRecoveryTitle]) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
    // companions and documents are shown, not edited here
    expect(screen.queryByRole("button", { name: tr.companionsTitle })).toBeNull();
    expect(screen.queryByRole("button", { name: tr.documentsTitle })).toBeNull();
  });

  it("is in Spanish on the Spanish route", () => {
    renderScreen(summaryWith(), "es");
    fireEvent.click(screen.getByRole("button", { name: es.IntakeReview.editNameTitle }));

    expect(screen.getByRole("heading", { name: es.CaseSummary.heading })).toBeInTheDocument();
    expect(screen.getByLabelText(es.CaseSummary.phoneLabel)).toBeDisabled();
    expect(screen.getByText(es.CaseSummary.contactLocked)).toBeInTheDocument();
  });
});

describe("Case Summary — unsaved changes", () => {
  beforeEach(() => {
    push.mockReset();
    save.mockReset();
  });

  it("lets an in-app link through when nothing has changed", () => {
    renderScreen();

    expect(clickLink("/en/intake/dashboard")).toBe(false);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("stops an in-app link, such as the header's, while edits are unsaved; Keep editing keeps them", () => {
    renderScreen();
    editInjuries();

    expect(clickLink("/en/intake/dashboard")).toBe(true);
    const dialog = screen.getByRole("alertdialog", { name: t.unsavedTitle });
    fireEvent.click(within(dialog).getByRole("button", { name: t.keepEditing }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(
      screen.getByText(
        `${en.IntakeInjury.back} · ${en.IntakeInjury.upperBody} · ${en.IntakeInjury.headNeck} · Left wrist`
      )
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("drops the edits and goes where the link pointed when the patient discards them", () => {
    renderScreen();
    editInjuries();
    clickLink("/en/intake/doctor");
    fireEvent.click(screen.getByRole("button", { name: t.discard }));

    expect(push).toHaveBeenCalledWith("/en/intake/doctor");
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText(`${en.IntakeInjury.back} · ${en.IntakeInjury.upperBody} · Left wrist`)).toBeInTheDocument();
  });

  it("asks the browser to confirm a reload or tab close only while edits are unsaved", () => {
    renderScreen();
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    editInjuries();
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it("stops asking once the edits are saved", async () => {
    save.mockResolvedValue(summaryWith({ injuries: "back,upperBody,headNeck,Left wrist" }));
    renderScreen();
    editInjuries();
    fireEvent.click(saveButton());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/intake/dashboard"));

    const afterSave = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(afterSave);
    expect(afterSave.defaultPrevented).toBe(false);
    expect(clickLink("/en/intake/dashboard")).toBe(false);
  });
});
