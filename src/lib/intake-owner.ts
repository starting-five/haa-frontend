import { isAuthApiError, isAuthSessionMissingError } from "@supabase/supabase-js";
import { releaseIntakeFromOtherUser } from "@/lib/intake-session";
import { createClient } from "@/lib/supabase/client";

/**
 * The user the auth server confirms for this browser: their id, null when there
 * is none, undefined when it could not be found out.
 *
 * getUser asks the server rather than reading the stored session, because the
 * stored session is exactly what goes stale: a session for an account deleted in
 * the dashboard still decodes locally to that account. No session, or a token the
 * server refuses (the account is gone, or the token was revoked), means nobody.
 * A dropped connection or a server error decides nothing.
 */
export async function confirmedUserId(): Promise<string | null | undefined> {
  try {
    const { data, error } = await createClient().auth.getUser();
    if (data.user) return data.user.id;
    if (!error || isAuthSessionMissingError(error)) return null;
    if (isAuthApiError(error) && error.status >= 400 && error.status < 500) return null;
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * For the intake's entry screens: clears intake state that belongs to someone
 * other than the account signed in now, before the screen shows any of it (see
 * releaseIntakeFromOtherUser). When the account cannot be confirmed the tab is
 * left as it is. Returns whether anything was cleared.
 */
export async function releaseStaleIntake(storage: Storage): Promise<boolean> {
  const userId = await confirmedUserId();
  if (userId === undefined) return false;
  return releaseIntakeFromOtherUser(storage, userId);
}
