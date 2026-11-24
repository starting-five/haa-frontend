import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en.json";
import { ScreenHeader } from "../screen-header";

const push = vi.fn();
const replace = vi.fn();
const back = vi.fn();
const prefetch = vi.fn();
let pathname = "/en/get-help";

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
  useRouter: () => ({ push, replace, back, prefetch }),
  useParams: () => ({ locale: "en" }),
  usePathname: () => pathname,
}));

const renderHeader = (props: Parameters<typeof ScreenHeader>[0] = {}) =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
    >
      <ScreenHeader {...props} />
    </NextIntlClientProvider>
  );

const backButton = () => screen.queryByRole("button", { name: messages.ScreenHeader.back });

describe("ScreenHeader", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    back.mockReset();
    prefetch.mockReset();
    pathname = "/en/get-help";
  });

  it("offers no back control by default", async () => {
    renderHeader();

    expect(backButton()).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Log in/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: messages.ScreenHeader.call })).toHaveAttribute("href", "tel:+18888804357");

    const menuButton = screen.getByRole("button", { name: "Open menu" });
    await userEvent.click(menuButton);

    await userEvent.click(screen.getByRole("button", { name: /Log in/i }));
    expect(push).toHaveBeenCalledWith("/en/patient/login");

    await userEvent.click(menuButton);

    expect(screen.getByRole("button", { name: /Log in/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Language/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Get help/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Privacy policy/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Terms & conditions/i })).not.toBeInTheDocument();
  });

  it("still offers it to the screens that ask for it", () => {
    renderHeader({ showBack: true });

    expect(backButton()).toBeInTheDocument();
  });

  it("keeps the language selector menu item visible when other controls are toggled", async () => {
    renderHeader({ showCallButton: false });

    expect(screen.queryByRole("link", { name: messages.ScreenHeader.call })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(screen.getByRole("button", { name: /Language/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: messages.ScreenHeader.call })).not.toBeInTheDocument();
    expect(screen.getByAltText("HelpAfterAccident")).toBeInTheDocument();
  });

  it("routes ambassador log in to ambassador login", async () => {
    pathname = "/en/ambassadors/dashboard";
    renderHeader();

    expect(screen.queryByRole("link", { name: messages.ScreenHeader.call })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    await userEvent.click(screen.getByRole("button", { name: /Log in/i }));

    expect(push).toHaveBeenCalledWith("/en/ambassadors/login");
  });

  it("shows the ambassadors link in the menu", async () => {
    pathname = "/en";
    renderHeader();

    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(screen.getByRole("link", { name: "Ambassadors" })).toHaveAttribute("href", "/en/ambassadors");
  });

  // The logo is the start of the screen's own flow. On the ambassador's screens
  // it leads to the ambassador landing (which sends a signed-in ambassador on to
  // their dashboard), never into the patient flow; on the patient's, to the
  // patient landing, never to an ambassador page.
  it("leads home within the screen's own flow", () => {
    for (const [path, home] of [
      ["/en/intake/dashboard", "/en"],
      ["/en/get-help", "/en"],
      ["/en/patient/login", "/en"],
      ["/en/ambassadors/dashboard", "/en/ambassadors"],
      ["/en/ambassadors/onboarding/share-it", "/en/ambassadors"],
    ] as const) {
      pathname = path;
      const { unmount } = renderHeader();
      expect(screen.getByRole("link", { name: messages.ScreenHeader.homeLabel })).toHaveAttribute("href", home);
      unmount();
    }
  });
});

// The patient dashboard's header (Figma 5783:5481): Call and "EN ⌄" in place of
// the menu. Every other screen keeps the menu, which the tests above cover.
describe("ScreenHeader with the language picker", () => {
  beforeEach(() => {
    push.mockReset();
    pathname = "/en/intake/dashboard";
    window.history.pushState({}, "", "/en/intake/dashboard");
    sessionStorage.clear();
  });

  it("draws Call in Inter SemiBold 14 and the locale with a chevron, and no menu", () => {
    renderHeader({ languagePicker: true });

    const call = screen.getByRole("link", { name: messages.ScreenHeader.call });
    expect(call).toHaveAttribute("href", "tel:+18888804357");
    expect(call.className).toContain("text-[14px]");
    expect(call.className).toContain("font-semibold");
    const picker = screen.getByRole("button", { name: `${messages.ScreenHeader.language}: English` });
    expect(picker).toHaveTextContent("EN");
    expect(picker).toHaveAttribute("aria-expanded", "false");
    expect(picker.querySelector('svg[aria-hidden="true"] path')).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Open menu" })).toBeNull();
  });

  it("switches to Spanish on the same screen, without reopening a menu", async () => {
    const user = userEvent.setup();
    renderHeader({ languagePicker: true });

    await user.click(screen.getByRole("button", { name: `${messages.ScreenHeader.language}: English` }));
    expect(screen.getByRole("button", { name: `${messages.ScreenHeader.language}: English` })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    await user.click(screen.getByRole("button", { name: "Español" }));

    expect(push).toHaveBeenCalledWith("/es/intake/dashboard");
    expect(sessionStorage.getItem("screen-header:reopen-menu")).toBeNull();
  });

  it("leaves the menu on screens that do not ask for the picker", () => {
    renderHeader();

    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `${messages.ScreenHeader.language}: English` })).toBeNull();
    expect(screen.getByRole("link", { name: messages.ScreenHeader.call }).className).toContain("text-[15px]");
  });
});
