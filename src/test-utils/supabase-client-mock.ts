import { vi } from "vitest";

// Since HP-80 the shared `ScreenHeader` builds a Supabase browser client and
// watches auth state, so every screen that draws a header now depends on it.
// Page tests were written before that and mock only what their own page calls,
// which left them failing during header setup rather than testing the page.
//
// This is the header's dependency, not the page's, so it lives here instead of
// being copied into a dozen files. It is deliberately NOT installed globally:
// a page that uses Supabase for its own work should still say so, and a blanket
// mock would quietly satisfy that too.
//
// A page that asserts on auth calls keeps its own mock and simply adds
// `onAuthStateChange` — see intake/dashboard, which pins the sign-out order.

/**
 * The narrowest client that satisfies `ScreenHeader`: signed out, with a
 * subscription the component can unsubscribe from on unmount.
 *
 * Use it as the whole module factory, which keeps the call hoisting-safe:
 *
 *   vi.mock("@/lib/supabase/client", async () =>
 *     (await import("@/test-utils/supabase-client-mock")).headerOnlySupabaseClient()
 *   );
 */
export function headerOnlySupabaseClient() {
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => channel),
  };

  return {
    createClient: () => ({
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
        signOut: vi.fn(async () => ({ error: null })),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
      },
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => ({ error: null })),
    }),
  };
}

/**
 * The auth-state subscription shape `ScreenHeader` expects back from
 * `onAuthStateChange`. Exported for tests that keep their own client mock and
 * only need to add this one method.
 */
export function authStateSubscription() {
  return { data: { subscription: { unsubscribe: vi.fn() } } };
}
