import { LOCALE_CODES } from "../i18n/locales";

export type AppFlow = "patient" | "ambassador";

/**
 * Which flow a path belongs to. The route is the flow: one phone number can be
 * both a patient and an ambassador — the same Supabase user, with a claimant
 * and an ambassador profile — so what the account holds can never say where the
 * person is going. Where they are can: /ambassadors/* is the ambassador's app,
 * and the locale root, get-help, intake/*, patient/* and case/* are the
 * patient's. Everything else (review links, lawyers, auth, access) is neither.
 *
 * Routing only. It decides which screens and which dashboard a request is
 * steered to, never what data it may read: every patient route resolves the
 * caller's own claimant on the backend, and every ambassador route checks the
 * caller's own ambassador profile, whatever path they arrived on.
 */
export function appFlowForPath(pathname: string): AppFlow | null {
  const segments = pathname.split("/").filter(Boolean);
  if (!segments.length || !LOCALE_CODES.includes(segments[0])) return null;

  const area = segments[1];
  if (area === "ambassadors") return "ambassador";
  if (area === undefined || area === "get-help" || area === "intake" || area === "patient" || area === "case") {
    return "patient";
  }
  return null;
}
