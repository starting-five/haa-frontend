import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../../messages/en.json";

// The username screen. The HAA link is a promise the username makes, so it is
// only shown once the username could become one (Figma 3749:14543 shows it,
// 3720:13975 and 3749:14416 do not).
//
// The availability check has five outcomes and each one gets its own message.
// The one that used to be wrong matters most: a server missing its service role
// key told the ambassador their username was malformed, which sent them off
// editing a perfectly good username.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/ambassadors/onboarding/username",
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
}));
// the header this page renders builds a Supabase client and watches auth state
vi.mock("@/lib/supabase/client", async () =>
  (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
);

vi.mock("@/hooks/use-require-session-key", () => ({ useRequireSessionKey: () => {} }));

const checkUsernameAvailability = vi.fn();
vi.mock("@/services/ambassadors", () => ({
  checkUsernameAvailability: (username: string) => checkUsernameAvailability(username),
}));

import AmbassadorOnboardingUsernamePage from "../page";

const copy = en.OnboardingAmbassadorLocation;
const ambassadorLinkHost = process.env.NEXT_PUBLIC_AMBASSADOR_LINK_HOST ?? "go.test.helpafteraccident.com";

const renderPage = () =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={en}
    >
      <AmbassadorOnboardingUsernamePage />
    </NextIntlClientProvider>
  );

const usernameField = () => screen.getByPlaceholderText(copy.label);
const continueButton = () => screen.getByRole("button", { name: en.Common.continue });
const linkBlock = () => screen.queryByText(copy.linkTitle);

const typeUsername = (value: string) => fireEvent.change(usernameField(), { target: { value } });

describe("ambassador onboarding username", () => {
  beforeEach(() => {
    push.mockReset();
    checkUsernameAvailability.mockReset();
    checkUsernameAvailability.mockResolvedValue({ status: "available" });
    sessionStorage.clear();
  });

  it("shows the heading and the HAA-link subtitle", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: copy.heading })).toBeInTheDocument();
    expect(screen.getByText(copy.subtext)).toBeInTheDocument();
  });

  it("keeps the HAA link block hidden until the username is valid", () => {
    renderPage();
    expect(linkBlock()).not.toBeInTheDocument();

    // too short to become a link
    typeUsername("dj");
    expect(linkBlock()).not.toBeInTheDocument();
    expect(continueButton()).toBeDisabled();

    typeUsername("djjoi");
    expect(linkBlock()).toBeInTheDocument();
    expect(screen.getByText(`${ambassadorLinkHost}/djjoi`)).toBeInTheDocument();
    expect(continueButton()).toBeEnabled();
  });

  it("moves an available username on and stores it", async () => {
    renderPage();
    typeUsername("djjoi");
    fireEvent.click(continueButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/ambassadors/onboarding/phone"));
    expect(checkUsernameAvailability).toHaveBeenCalledWith("djjoi");
    expect(sessionStorage.getItem("onboarding_ambassador_username")).toBe("djjoi");
  });

  it("says the username is taken, and takes the link block away", async () => {
    checkUsernameAvailability.mockResolvedValue({ status: "taken" });
    renderPage();
    typeUsername("djoi");
    fireEvent.click(continueButton());

    expect(await screen.findByText(copy.usernameTaken)).toBeInTheDocument();
    expect(linkBlock()).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("blames the server, not the username, when the server is misconfigured", async () => {
    checkUsernameAvailability.mockResolvedValue({
      status: "misconfigured",
      missing: ["SUPABASE_SERVICE_ROLE_KEY"],
    });
    renderPage();
    typeUsername("djjoi");
    fireEvent.click(continueButton());

    const message = await screen.findByRole("alert");
    // outside production the message names the variable that is not set — never its value
    expect(message).toHaveTextContent("SUPABASE_SERVICE_ROLE_KEY");
    expect(message).not.toHaveTextContent(copy.usernameInvalid);
    expect(message).not.toHaveTextContent(copy.usernameTaken);
    expect(push).not.toHaveBeenCalled();
  });

  it("asks for a retry when the check itself could not run", async () => {
    checkUsernameAvailability.mockResolvedValue({ status: "unavailable" });
    renderPage();
    typeUsername("djjoi");
    fireEvent.click(continueButton());

    const message = await screen.findByRole("alert");
    expect(message).not.toHaveTextContent(copy.usernameInvalid);
    expect(message).not.toHaveTextContent(copy.usernameTaken);
    expect(push).not.toHaveBeenCalled();
  });

  it("still shows the format message when the server rejects the format", async () => {
    checkUsernameAvailability.mockResolvedValue({ status: "invalid" });
    renderPage();
    typeUsername("djjoi");
    fireEvent.click(continueButton());

    expect(await screen.findByText(copy.usernameInvalid)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
