import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en.json";
import { OtpScreen } from "../otp-screen";

// The code screen's states as the design draws them (Figma 2168:3147 default,
// 2170:3261 filled, 2824:8402 verifying, p-203-error-incorrect-code): one
// bordered box holding six slots that show a dash until a digit fills them, the
// sent-to number with "Change number", the expiry countdown and a centred
// "Resend code" under the box, and a red box plus message when the code was
// wrong. The input itself is the same one-time-code field, so autofill and
// paste are unchanged.

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
  usePathname: () => "/en/ambassadors/login/otp",
}));

const onVerify = vi.fn();
const onChangePhone = vi.fn();
const onResend = vi.fn();

const renderScreen = (props: Partial<React.ComponentProps<typeof OtpScreen>> = {}) =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
    >
      {/* These cases were written against the Brand Ambassador frame
          (2168:3147), so they pin that variant explicitly and stand as its
          regression guard now that the component draws two designs. The
          Patient Flow frames are covered in their own block below. */}
      <OtpScreen
        variant="ambassador"
        expiresAt={Date.now() + 600_000}
        phone="(407) 555-1234"
        onVerify={onVerify}
        onChangePhone={onChangePhone}
        onResend={onResend}
        {...props}
      />
    </NextIntlClientProvider>
  );

const slots = () => [...document.querySelectorAll('[data-slot="input-otp-slot"]')];
const box = () => document.querySelector('[data-slot="input-otp-group"]') as HTMLElement;
// the expiry line is the screen's only timer, so the role is a stable handle on it
const countdown = () => screen.getByRole("timer");
const resendButton = () => screen.getByRole("button", { name: messages.Otp.resend });

describe("OtpScreen", () => {
  // input-otp probes for a password-manager badge on a timer, and jsdom has no
  // elementFromPoint — handing back the field's own container makes that probe a
  // no-op so the clock can be advanced without it throwing
  beforeAll(() => {
    document.elementFromPoint = () => document.querySelector("[data-input-otp-container]");
  });

  beforeEach(() => {
    onVerify.mockClear();
    onChangePhone.mockClear();
    onResend.mockClear();
  });

  it("shows the default state: heading, number, six dashes in one box, resend and change number", () => {
    renderScreen();

    expect(screen.getByRole("heading", { name: messages.Otp.heading })).toBeInTheDocument();
    expect(screen.getByText("We sent a 6-digit code to (407) 555-1234")).toBeInTheDocument();
    expect(slots()).toHaveLength(6);
    // the frame draws all six dashes with the keyboard open — no caret over the first
    expect(slots().map((slot) => slot.textContent)).toEqual(["—", "—", "—", "—", "—", "—"]);
    expect(slots()[0].querySelector(".animate-pulse")).toBeNull();
    expect(box().className).toMatch(/border-\[#e5e5ea\]/);
    expect(screen.getByRole("button", { name: messages.Otp.resend })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.Otp.changePhone })).toBeInTheDocument();
  });

  it("offers no back control to the patient flow", () => {
    renderScreen();

    expect(screen.queryByRole("button", { name: messages.ScreenHeader.back })).not.toBeInTheDocument();
  });

  it("shows the digits as they are entered and submits once on the sixth", () => {
    renderScreen();
    const input = document.querySelector("input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "482" } });
    expect(slots().map((slot) => slot.textContent)).toEqual(["4", "8", "2", "—", "—", "—"]);

    fireEvent.change(input, { target: { value: "482091" } });
    expect(slots().map((slot) => slot.textContent)).toEqual(["4", "8", "2", "0", "9", "1"]);
    expect(onVerify).toHaveBeenCalledTimes(1);
    expect(onVerify).toHaveBeenCalledWith("482091");
  });

  it("keeps the one-time-code autofill and numeric keyboard hints on the real input", () => {
    renderScreen();
    const input = document.querySelector("input") as HTMLInputElement;
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(input.maxLength).toBe(6);
  });

  it("turns the box red and shows the design's message when the code was wrong", () => {
    renderScreen({ error: messages.Otp.invalidCode });

    expect(screen.getByRole("alert")).toHaveTextContent("That code didn't work. Try again.");
    expect(box().dataset.error).toBe("true");
  });

  it("resends and changes the number through their own controls", () => {
    // Patient Flow draws no countdown and keeps resend live, so it is the
    // variant that can exercise both controls without waiting out a window.
    renderScreen({ variant: "patient" });
    fireEvent.click(screen.getByRole("button", { name: messages.Otp.resend }));
    fireEvent.click(screen.getByRole("button", { name: messages.Otp.changePhone }));
    expect(onResend).toHaveBeenCalledTimes(1);
    expect(onChangePhone).toHaveBeenCalledTimes(1);
  });

  // The window is a deadline now, not a tally of ticks: the screen is told when
  // the code stops being accepted and recomputes the display from the clock. So
  // these drive `expiresAt` and the system time rather than counting intervals.
  describe("expiry countdown", () => {
    const NOW = 1_700_000_000_000;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const renderWithDeadline = (msFromNow: number, props = {}) =>
      renderScreen({ expiresAt: Date.now() + msFromNow, ...props });

    it("counts the ten-minute window down once a second and stops at 00:00", () => {
      renderWithDeadline(600_000);
      expect(countdown()).toHaveTextContent("10:00");

      act(() => void vi.advanceTimersByTime(1000));
      expect(countdown()).toHaveTextContent("09:59");

      act(() => void vi.advanceTimersByTime(59_000));
      expect(countdown()).toHaveTextContent("09:00");

      act(() => void vi.advanceTimersByTime(540_000));
      expect(countdown()).toHaveTextContent("00:00");

      // the window never runs past zero, however long the screen stays open
      act(() => void vi.advanceTimersByTime(60_000));
      expect(countdown()).toHaveTextContent("00:00");
    });

    it("draws whatever is left of the window it is given, not a fresh one", () => {
      renderWithDeadline(90_000);
      expect(countdown()).toHaveTextContent("01:30");

      act(() => void vi.advanceTimersByTime(31_000));
      expect(countdown()).toHaveTextContent("00:59");
    });

    // -----------------------------------------------------------------------
    // The point of a deadline: time that passes while the screen is gone still
    // counts. A remount must not hand the user a fresh ten minutes.
    // -----------------------------------------------------------------------
    it("keeps counting real time across unmount and remount", () => {
      const deadline = Date.now() + 600_000;
      const first = renderScreen({ expiresAt: deadline });
      act(() => void vi.advanceTimersByTime(120_000)); // 2 minutes on screen
      expect(countdown()).toHaveTextContent("08:00");

      first.unmount();
      act(() => void vi.advanceTimersByTime(180_000)); // 3 minutes away

      renderScreen({ expiresAt: deadline });
      // 5 minutes have actually passed, so 5 remain — not 10
      expect(countdown()).toHaveTextContent("05:00");
    });

    it("comes back expired when the window closed while the screen was away", () => {
      const deadline = Date.now() + 600_000;
      const first = renderScreen({ expiresAt: deadline });
      first.unmount();

      act(() => void vi.advanceTimersByTime(700_000)); // well past the window

      renderScreen({ expiresAt: deadline });
      expect(countdown()).toHaveTextContent("00:00");
      // and the control is offered again straight away
      expect(resendButton()).toBeEnabled();
    });

    it("continues from the original deadline when the user returns before expiry", () => {
      const deadline = Date.now() + 600_000;
      const first = renderScreen({ expiresAt: deadline });
      first.unmount();
      act(() => void vi.advanceTimersByTime(90_000));

      renderScreen({ expiresAt: deadline });
      expect(countdown()).toHaveTextContent("08:30");
    });

    it("adopts a new deadline when one is issued, and counts that one instead", () => {
      const { rerender } = renderScreen({ expiresAt: Date.now() + 600_000 });
      act(() => void vi.advanceTimersByTime(600_000));
      expect(countdown()).toHaveTextContent("00:00");

      // a successful resend is a new window, handed down from the page
      const fresh = Date.now() + 600_000;
      rerender(
        <NextIntlClientProvider
          locale="en"
          messages={messages}
        >
          <OtpScreen
            variant="ambassador"
            expiresAt={fresh}
            phone="(407) 555-1234"
            onVerify={onVerify}
            onChangePhone={onChangePhone}
            onResend={onResend}
          />
        </NextIntlClientProvider>
      );
      expect(countdown()).toHaveTextContent("10:00");

      act(() => void vi.advanceTimersByTime(1000));
      expect(countdown()).toHaveTextContent("09:59");
    });

    it("drops the countdown's interval when the screen goes away", () => {
      const { unmount } = renderWithDeadline(600_000);
      act(() => void vi.advanceTimersByTime(1000));
      expect(countdown()).toHaveTextContent("09:59");

      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("never leaves a second interval running when the deadline is replaced", () => {
      const setSpy = vi.spyOn(globalThis, "setInterval");
      const clearSpy = vi.spyOn(globalThis, "clearInterval");

      const { unmount } = renderWithDeadline(600_000);
      for (let cycle = 0; cycle < 3; cycle += 1) {
        act(() => void vi.advanceTimersByTime(600_000));
      }
      unmount();

      // a leaked interval is what makes a countdown tick twice a second
      expect(clearSpy.mock.calls.length).toBeGreaterThanOrEqual(setSpy.mock.calls.length);
      expect(vi.getTimerCount()).toBe(0);
      setSpy.mockRestore();
      clearSpy.mockRestore();
    });
  });

  describe("resend button", () => {
    const NOW = 1_700_000_000_000;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("is disabled while a verification is in flight", () => {
      renderScreen({ status: "verifying", expiresAt: Date.now() + 600_000 });

      expect(resendButton()).toBeDisabled();
      fireEvent.click(resendButton());
      expect(onResend).not.toHaveBeenCalled();
    });

    it("stays shut, and says so to assistive tech, until the window has run out", () => {
      renderScreen({ expiresAt: Date.now() + 600_000 });

      expect(resendButton()).toBeDisabled();
      expect(resendButton()).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(resendButton());
      expect(onResend).not.toHaveBeenCalled();

      act(() => void vi.advanceTimersByTime(599_000));
      expect(resendButton()).toBeDisabled();

      act(() => void vi.advanceTimersByTime(1000));
      expect(countdown()).toHaveTextContent("00:00");
      expect(resendButton()).toBeEnabled();
      expect(resendButton()).toHaveAttribute("aria-disabled", "false");
    });

    it("sends on the first press after expiry, with no reload", () => {
      renderScreen({ expiresAt: Date.now() + 600_000 });
      act(() => void vi.advanceTimersByTime(600_000));

      fireEvent.click(resendButton());
      expect(onResend).toHaveBeenCalledTimes(1);
    });

    it("refuses a second press while the first send is still in flight", async () => {
      let sent: () => void = () => {};
      onResend.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          sent = resolve;
        })
      );

      renderScreen({ expiresAt: Date.now() + 600_000 });
      act(() => void vi.advanceTimersByTime(600_000));

      fireEvent.click(resendButton());
      expect(onResend).toHaveBeenCalledTimes(1);
      expect(resendButton()).toBeDisabled();

      // a second press while the first is in flight would only race it
      fireEvent.click(resendButton());
      expect(onResend).toHaveBeenCalledTimes(1);

      await act(async () => {
        sent();
      });
      // the send settled and the old window is still spent, so it is offered again
      expect(resendButton()).toBeEnabled();
    });

    it("hands the button back when the resend request fails", async () => {
      let fail: (reason?: unknown) => void = () => {};
      onResend.mockReturnValueOnce(
        new Promise<void>((_, reject) => {
          fail = reject;
        })
      );

      renderScreen({ expiresAt: Date.now() + 600_000 });
      act(() => void vi.advanceTimersByTime(600_000));

      await act(async () => {
        fireEvent.click(resendButton());
        fail(new Error("network"));
      });
      // a refused send opens no new window, so the control stays available
      expect(resendButton()).toBeEnabled();
      expect(countdown()).toHaveTextContent("00:00");
    });

    it("offers resend when no code has been sent yet at all", () => {
      renderScreen({ expiresAt: null });
      expect(resendButton()).toBeEnabled();
    });
  });

  // ---------------------------------------------------------------------------
  // Asking for a code and checking one are different errands. Only the second
  // may say "Verifying" — pressing Resend used to announce it, which told the
  // user the screen was doing something it was not.
  // ---------------------------------------------------------------------------
  describe("what the screen says it is doing", () => {
    it("says nothing while idle", () => {
      renderScreen();
      expect(screen.queryByTestId("otp-verifying")).not.toBeInTheDocument();
      expect(screen.queryByTestId("otp-sending")).not.toBeInTheDocument();
    });

    it("says Verifying only while a code is being checked", () => {
      renderScreen({ status: "verifying" });
      expect(screen.getByTestId("otp-verifying")).toHaveTextContent(messages.Otp.verifying);
      expect(screen.queryByTestId("otp-sending")).not.toBeInTheDocument();
    });

    it("says Sending while a code is being requested, and never Verifying", () => {
      renderScreen({ status: "sending" });
      expect(screen.getByTestId("otp-sending")).toHaveTextContent(messages.Otp.sending);
      expect(screen.queryByTestId("otp-verifying")).not.toBeInTheDocument();
      expect(document.body.textContent).not.toContain(messages.Otp.verifying);
    });

    it("never says Verifying while a resend is in flight", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_700_000_000_000);
      try {
        let sent: () => void = () => {};
        onResend.mockReturnValueOnce(
          new Promise<void>((resolve) => {
            sent = resolve;
          })
        );

        renderScreen({ expiresAt: Date.now() + 600_000 });
        act(() => void vi.advanceTimersByTime(600_000));

        fireEvent.click(resendButton());
        // this is the bug this test exists for
        expect(screen.queryByTestId("otp-verifying")).not.toBeInTheDocument();
        expect(document.body.textContent).not.toContain(messages.Otp.verifying);
        expect(screen.getByTestId("otp-sending")).toBeInTheDocument();

        await act(async () => {
          sent();
        });
        expect(screen.queryByTestId("otp-sending")).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("says Verifying for the patient frame too, and only then", () => {
      const { rerender } = renderScreen({ variant: "patient", status: "sending" });
      expect(document.body.textContent).not.toContain(messages.Otp.verifying);

      rerender(
        <NextIntlClientProvider
          locale="en"
          messages={messages}
        >
          <OtpScreen
            variant="patient"
            phone="(407) 555-1234"
            status="verifying"
            onVerify={onVerify}
            onChangePhone={onChangePhone}
            onResend={onResend}
          />
        </NextIntlClientProvider>
      );
      expect(screen.getByTestId("otp-verifying")).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // A different number is a different verification session. Nothing typed for
  // the old one may still be sitting there.
  // ---------------------------------------------------------------------------
  describe("changing the number starts a clean session", () => {
    const renderWith = (phone: string, props = {}) =>
      render(
        <NextIntlClientProvider
          locale="en"
          messages={messages}
        >
          <OtpScreen
            variant="ambassador"
            phone={phone}
            onVerify={onVerify}
            onChangePhone={onChangePhone}
            onResend={onResend}
            {...props}
          />
        </NextIntlClientProvider>
      );

    it("clears the digits typed for the previous number", () => {
      const { rerender } = renderWith("(407) 555-1234");
      const input = document.querySelector("input") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "482" } });
      expect(slots().map((s) => s.textContent)).toEqual(["4", "8", "2", "—", "—", "—"]);

      rerender(
        <NextIntlClientProvider
          locale="en"
          messages={messages}
        >
          <OtpScreen
            variant="ambassador"
            phone="(407) 555-9999"
            onVerify={onVerify}
            onChangePhone={onChangePhone}
            onResend={onResend}
          />
        </NextIntlClientProvider>
      );

      expect(slots().map((s) => s.textContent)).toEqual(["—", "—", "—", "—", "—", "—"]);
      expect(screen.getByText("We sent a 6-digit code to (407) 555-9999")).toBeInTheDocument();
    });

    it("keeps the digits when the same number simply re-renders", () => {
      const { rerender } = renderWith("(407) 555-1234");
      const input = document.querySelector("input") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "48" } });

      rerender(
        <NextIntlClientProvider
          locale="en"
          messages={messages}
        >
          <OtpScreen
            variant="ambassador"
            phone="(407) 555-1234"
            error=""
            onVerify={onVerify}
            onChangePhone={onChangePhone}
            onResend={onResend}
          />
        </NextIntlClientProvider>
      );
      expect(slots().map((s) => s.textContent)).toEqual(["4", "8", "—", "—", "—", "—"]);
    });
  });

  // ---------------------------------------------------------------------------
  // The Call control is removed and the menu now only keeps language plus
  // auth/navigation entries.
  // ---------------------------------------------------------------------------
  describe("header menu entries", () => {
    it("does not offer help/legal links on the ambassador frame", async () => {
      renderScreen();
      expect(screen.queryByRole("link", { name: messages.ScreenHeader.call })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
      expect(screen.queryByRole("link", { name: /Get help/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Privacy policy/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Terms & conditions/i })).not.toBeInTheDocument();
    });

    it("does not offer help/legal links on the patient frame", async () => {
      renderScreen({ variant: "patient" });
      expect(screen.queryByRole("link", { name: messages.ScreenHeader.call })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
      expect(screen.queryByRole("link", { name: /Get help/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Privacy policy/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Terms & conditions/i })).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Patient Flow — Figma 1949:3246 (default), 1949:3317 (filled), 1984:2973
  // (verifying). The default variant, and what the intake, patient-login and
  // lawyer screens draw.
  // ---------------------------------------------------------------------------
  describe("patient flow variant", () => {
    const renderPatient = (props: Partial<React.ComponentProps<typeof OtpScreen>> = {}) =>
      render(
        <NextIntlClientProvider
          locale="en"
          messages={messages}
        >
          <OtpScreen
            phone="(407) 555-1234"
            onVerify={onVerify}
            onChangePhone={onChangePhone}
            onResend={onResend}
            {...props}
          />
        </NextIntlClientProvider>
      );

    it("draws the frame's box: radius 8, a #d1d3d9 edge and 16px of side padding", () => {
      renderPatient();

      expect(box().className).toMatch(/rounded-\[8px\]/);
      expect(box().className).toMatch(/border-\[#d1d3d9\]/);
      expect(box().className).toMatch(/px-\[16px\]/);
      expect(slots()).toHaveLength(6);
      expect(slots().map((slot) => slot.textContent)).toEqual(["—", "—", "—", "—", "—", "—"]);
    });

    it("shows no expiry countdown — the patient frames carry none", () => {
      renderPatient();

      expect(screen.queryByRole("timer")).not.toBeInTheDocument();
      expect(screen.queryByText(/Code expires in/i)).not.toBeInTheDocument();
    });

    it("leaves the resend plain and left-aligned, not the ambassador's underlined centre", () => {
      renderPatient();

      const resend = resendButton();
      expect(resend.className).toMatch(/text-\[14px\]/);
      expect(resend.className).toMatch(/font-medium/);
      expect(resend.className).not.toMatch(/underline/);
      expect(resend.className).toMatch(/self-start/);
    });

    it("keeps every cell flat, with no brand highlight on the focused one", () => {
      renderPatient();

      for (const slot of slots()) {
        expect(slot.className).toMatch(/text-\[#999999\]/);
        expect(slot.className).not.toMatch(/data-\[active=true\]:text-brand/);
      }
    });

    it("fills the box with the digits the user types (1949:3317)", () => {
      renderPatient();

      const input = document.querySelector("input[data-input-otp]") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "48209" } });

      expect(slots().map((slot) => slot.textContent)).toEqual(["4", "8", "2", "0", "9", "—"]);
    });

    it("announces the verifying state in the frame's own type (1984:2973)", () => {
      renderPatient({ status: "verifying" });

      const status = screen.getByRole("status");
      expect(status).toHaveTextContent(messages.Otp.verifying);
      expect(status.className).toMatch(/text-\[13px\]/);
      expect(status.className).toMatch(/text-brand/);
    });

    it("still resends and changes the number through their own controls", () => {
      renderPatient();

      fireEvent.click(resendButton());
      expect(onResend).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: messages.Otp.changePhone }));
      expect(onChangePhone).toHaveBeenCalledTimes(1);
    });
    // -----------------------------------------------------------------------
    // The separation that matters: the ambassador frame holds its resend shut
    // until its countdown runs out, and Patient Flow must never inherit that.
    // -----------------------------------------------------------------------
    it("keeps resend live from the first moment, with no window to wait out", () => {
      vi.useFakeTimers();
      try {
        renderPatient();

        expect(resendButton()).toBeEnabled();
        fireEvent.click(resendButton());
        expect(onResend).toHaveBeenCalledTimes(1);

        // and it is still live after the ambassador's window would have elapsed
        act(() => {
          vi.advanceTimersByTime(600_000);
        });
        expect(resendButton()).toBeEnabled();
        fireEvent.click(resendButton());
        expect(onResend).toHaveBeenCalledTimes(2);
        // no countdown was ever drawn to gate it
        expect(screen.queryByRole("timer")).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("shows no From Message line until the browser actually supplies a code", () => {
      renderPatient();
      expect(screen.queryByTestId("otp-from-message")).not.toBeInTheDocument();
    });
  });
});
