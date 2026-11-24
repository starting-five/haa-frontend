import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../messages/en.json";

// Thomas, on Beta (2026-10-12): an account deleted in the Supabase dashboard, then
// the same number registered again in the same tab. The name screen offered the
// deleted patient's name, and the new patient was filed under it. The screen now
// asks the auth server who is signed in before it shows anything stored.

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/client", async () => {
  const header = (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient();
  return {
    createClient: () => {
      const client = header.createClient();
      return { ...client, auth: { ...client.auth, getUser: auth.getUser } };
    },
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/intake",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/hooks/use-preload-images", () => ({ usePreloadImages: () => {} }));
vi.mock("next/image", () => ({ default: () => <span data-testid="next-image" /> }));

import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import NamePage from "../page";

const page = () => (
  <NextIntlClientProvider
    locale="en"
    messages={en}
  >
    <NamePage />
  </NextIntlClientProvider>
);
const field = (id: string) => document.getElementById(id) as HTMLInputElement | null;

const deletedPatientTab = () => {
  sessionStorage.setItem("intake_ownerUserId", "user-old");
  sessionStorage.setItem("intake_submissionId", "sub-old");
  sessionStorage.setItem("intake_submitted", "1");
  sessionStorage.setItem("intake_firstName", "Marisol");
  sessionStorage.setItem("intake_lastName", "Quenneville");
};

describe("name screen — a tab left by another account", () => {
  beforeEach(() => {
    sessionStorage.clear();
    auth.getUser.mockReset();
  });

  it("starts empty, and drops the case id and marker, when the owner's account no longer exists", async () => {
    deletedPatientTab();
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("User from sub claim in JWT does not exist", 403, "user_not_found"),
    });
    render(page());

    await waitFor(() => expect(field("firstName")).not.toBeNull());
    expect(field("firstName")?.value).toBe("");
    expect(field("lastName")?.value).toBe("");
    expect(sessionStorage.getItem("intake_submissionId")).toBeNull();
    expect(sessionStorage.getItem("intake_submitted")).toBeNull();
  });

  it("starts empty when a different account is signed in", async () => {
    deletedPatientTab();
    auth.getUser.mockResolvedValue({ data: { user: { id: "user-new" } }, error: null });
    render(page());

    await waitFor(() => expect(field("firstName")).not.toBeNull());
    expect(field("firstName")?.value).toBe("");
  });

  it("still shows the owner's own name to the owner", async () => {
    deletedPatientTab();
    auth.getUser.mockResolvedValue({ data: { user: { id: "user-old" } }, error: null });
    render(page());

    await waitFor(() => expect(field("firstName")?.value).toBe("Marisol"));
    expect(sessionStorage.getItem("intake_submissionId")).toBe("sub-old");
  });

  it("clears nothing when the auth server cannot be reached — a dropped connection proves nothing", async () => {
    deletedPatientTab();
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("Failed to fetch", 0) });
    render(page());

    await waitFor(() => expect(field("firstName")?.value).toBe("Marisol"));
    expect(sessionStorage.getItem("intake_submissionId")).toBe("sub-old");
  });
});
