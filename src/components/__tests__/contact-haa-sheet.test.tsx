import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import {
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_MAILTO,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_SMS,
  SUPPORT_PHONE_TEL,
} from "@/lib/constants";
import { ContactHaaSheet } from "../contact-haa-sheet";

// One sheet serves the patient and Brand Ambassador dashboards, so the three
// destinations are pinned here once rather than per page.

const realLocation = window.location;
const locationAssign = vi.fn();

const renderSheet = (locale: "en" | "es" = "en", onOpenChange = vi.fn()) => {
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "es" ? es : en}
    >
      <ContactHaaSheet
        open
        onOpenChange={onOpenChange}
      />
    </NextIntlClientProvider>
  );
  return onOpenChange;
};

describe("ContactHaaSheet", () => {
  beforeEach(() => {
    locationAssign.mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...realLocation, assign: locationAssign },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, writable: true, value: realLocation });
  });

  it("is a labelled dialog offering call, text and email with their destinations", () => {
    renderSheet();
    const dialog = screen.getByRole("dialog", { name: en.ContactHaaSheet.title });
    expect(dialog).toHaveTextContent(en.ContactHaaSheet.description);
    expect(screen.getByRole("button", { name: new RegExp(`^${en.ContactHaaSheet.call}`) })).toHaveTextContent(
      SUPPORT_PHONE_DISPLAY
    );
    expect(screen.getByRole("button", { name: new RegExp(`^${en.ContactHaaSheet.text}`) })).toHaveTextContent(
      SUPPORT_PHONE_DISPLAY
    );
    expect(screen.getByRole("button", { name: new RegExp(`^${en.ContactHaaSheet.email}`) })).toHaveTextContent(
      SUPPORT_EMAIL
    );
  });

  it.each([
    ["call", SUPPORT_PHONE_TEL],
    ["text", SUPPORT_PHONE_SMS],
    ["email", SUPPORT_EMAIL_MAILTO],
  ] as const)("%s hands off to the phone and closes the sheet", (option, href) => {
    const onOpenChange = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${en.ContactHaaSheet[option]}`) }));
    expect(locationAssign).toHaveBeenCalledWith(href);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("cancel closes without leaving the page", () => {
    const onOpenChange = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: en.ContactHaaSheet.cancel }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(locationAssign).not.toHaveBeenCalled();
  });

  it("reads in Spanish", () => {
    renderSheet("es");
    expect(screen.getByRole("dialog", { name: es.ContactHaaSheet.title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: new RegExp(`^${es.ContactHaaSheet.call}`) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: es.ContactHaaSheet.cancel })).toBeInTheDocument();
  });
});
