import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en.json";
import esMessages from "../../../../messages/es.json";
import { PhoneScreen, formatUSPhone } from "../phone-screen";

// The number screen restores what the flow saved — "+1" plus ten digits — so
// "Change number" from the code screen must show the same ten digits again,
// not the country code as an area code.

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      signOut: vi.fn(async () => ({ error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/intake/phone",
}));

describe("PhoneScreen", () => {
  it("restores a stored +1 number as its ten national digits", () => {
    render(
      <NextIntlClientProvider
        locale="en"
        messages={messages}
      >
        <PhoneScreen
          heading="Mobile number?"
          onContinue={() => {}}
          initialPhone="+14075551234"
        />
      </NextIntlClientProvider>
    );
    expect(screen.getByPlaceholderText(messages.PhoneScreen.phoneLabel)).toHaveValue("(407) 555-1234");
  });

  it("formats ten digits as a US number", () => {
    expect(formatUSPhone("4075551234")).toBe("(407) 555-1234");
    expect(formatUSPhone("407")).toBe("(407");
  });

  // A message the patient cannot answer by correcting the field — "you already
  // have an account" — comes with the action that does answer it, and both stop
  // applying as soon as a different number is typed.
  it("keeps the address required unless a screen asks for it to be optional", () => {
    render(
      <NextIntlClientProvider
        locale="en"
        messages={messages}
      >
        <PhoneScreen
          heading="Mobile number?"
          onContinue={vi.fn()}
          initialPhone="+14075551234"
        />
      </NextIntlClientProvider>
    );

    expect(screen.getByPlaceholderText(messages.PhoneScreen.emailLabel)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.Common.continue })).toBeDisabled();
  });

  // The design labels the address "Email (optional)" (Figma 2079:3292): a blank
  // address is a complete answer, but anything actually typed still has to be a

  // The design labels the address "Email (optional)" (Figma 2079:3292): a blank
  // address is a complete answer, but anything actually typed still has to be a
  // real address.
  describe("optional email", () => {
    const renderScreen = (onContinue = vi.fn(), locale: "en" | "es" = "en") => {
      render(
        <NextIntlClientProvider
          locale={locale}
          messages={locale === "en" ? messages : esMessages}
        >
          <PhoneScreen
            heading="Mobile number?"
            onContinue={onContinue}
            initialPhone="+14075551234"
            requireEmail={false}
          />
        </NextIntlClientProvider>
      );
      return onContinue;
    };

    const continueButton = () => screen.getByRole("button", { name: messages.Common.continue });
    const emailField = () => screen.getByPlaceholderText(messages.PhoneScreen.emailLabelOptional);

    it("labels the field as optional, matching the design", () => {
      renderScreen();

      expect(emailField()).toBeInTheDocument();
      expect(messages.PhoneScreen.emailLabelOptional).toBe("Email (optional)");
    });

    it("enables Continue on the number alone and submits an empty address", () => {
      const onContinue = renderScreen();

      expect(continueButton()).toBeEnabled();
      fireEvent.click(continueButton());

      expect(onContinue).toHaveBeenCalledWith("+14075551234", "");
    });

    it("treats a whitespace-only address as no address", () => {
      const onContinue = renderScreen();

      fireEvent.change(emailField(), { target: { value: "   " } });

      expect(continueButton()).toBeEnabled();
      fireEvent.click(continueButton());

      expect(onContinue).toHaveBeenCalledWith("+14075551234", "");
    });

    it("lets an address be entered and then cleared again", () => {
      const onContinue = renderScreen();

      fireEvent.change(emailField(), { target: { value: "jane@example.com" } });
      fireEvent.change(emailField(), { target: { value: "" } });

      expect(continueButton()).toBeEnabled();
      fireEvent.click(continueButton());

      expect(onContinue).toHaveBeenCalledWith("+14075551234", "");
    });

    it("holds Continue and submits nothing while a typed address is malformed", () => {
      const onContinue = renderScreen();

      fireEvent.change(emailField(), { target: { value: "jane@" } });

      expect(continueButton()).toBeDisabled();
      fireEvent.submit(document.getElementById("phone-form")!);

      expect(onContinue).not.toHaveBeenCalled();
    });

    it("hands a valid address on unchanged", () => {
      const onContinue = renderScreen();

      fireEvent.change(emailField(), { target: { value: "jane@example.com" } });

      expect(continueButton()).toBeEnabled();
      fireEvent.click(continueButton());

      expect(onContinue).toHaveBeenCalledWith("+14075551234", "jane@example.com");
    });

    it("still requires a complete cell number", () => {
      const onContinue = vi.fn();
      render(
        <NextIntlClientProvider
          locale="en"
          messages={messages}
        >
          <PhoneScreen
            heading="Mobile number?"
            onContinue={onContinue}
            requireEmail={false}
          />
        </NextIntlClientProvider>
      );

      expect(continueButton()).toBeDisabled();
      fireEvent.submit(document.getElementById("phone-form")!);

      expect(onContinue).not.toHaveBeenCalled();
      expect(screen.getByText(messages.PhoneScreen.phoneRequired)).toBeInTheDocument();
    });

    it("uses the Spanish optional copy under the es locale", () => {
      renderScreen(vi.fn(), "es");

      expect(screen.getByPlaceholderText(esMessages.PhoneScreen.emailLabelOptional)).toBeInTheDocument();
      expect(esMessages.PhoneScreen.emailLabelOptional).toBe("Correo electrónico (opcional)");
    });

    it("leaves screens that hide the field alone", () => {
      const onContinue = vi.fn();
      render(
        <NextIntlClientProvider
          locale="en"
          messages={messages}
        >
          <PhoneScreen
            heading="Mobile number?"
            onContinue={onContinue}
            initialPhone="+14075551234"
            showEmail={false}
          />
        </NextIntlClientProvider>
      );

      const button = screen.getByRole("button", { name: messages.Common.continue });
      expect(button).toBeEnabled();
      fireEvent.click(button);
      expect(onContinue).toHaveBeenCalledWith("+14075551234", "");
    });
  });

  describe("an error with an action beside it", () => {
    const renderScreen = (props: Partial<Parameters<typeof PhoneScreen>[0]> = {}) =>
      render(
        <NextIntlClientProvider
          locale="en"
          messages={messages}
        >
          <PhoneScreen
            heading="Mobile number?"
            onContinue={() => {}}
            initialPhone="+14075551234"
            showEmail={false}
            {...props}
          />
        </NextIntlClientProvider>
      );

    const signIn = () => screen.queryByRole("button", { name: messages.IntakePhone.signIn });

    it("offers nothing extra when there is no error", () => {
      renderScreen({ secondaryLabel: messages.IntakePhone.signIn });

      expect(signIn()).not.toBeInTheDocument();
    });

    it("shows the message and the action together", () => {
      const onSecondaryClick = vi.fn();
      renderScreen({
        error: messages.IntakePhone.alreadyRegistered,
        secondaryLabel: messages.IntakePhone.signIn,
        onSecondaryClick,
      });

      expect(screen.getByText(messages.IntakePhone.alreadyRegistered)).toBeInTheDocument();
      fireEvent.click(signIn()!);
      expect(onSecondaryClick).toHaveBeenCalled();
    });

    it("drops both as soon as the number is edited", () => {
      renderScreen({
        error: messages.IntakePhone.alreadyRegistered,
        secondaryLabel: messages.IntakePhone.signIn,
      });

      fireEvent.change(screen.getByPlaceholderText(messages.PhoneScreen.phoneLabel), {
        target: { value: "(407) 555-9999" },
      });

      expect(screen.queryByText(messages.IntakePhone.alreadyRegistered)).not.toBeInTheDocument();
      expect(signIn()).not.toBeInTheDocument();
    });
  });
});
