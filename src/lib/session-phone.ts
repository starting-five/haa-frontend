/**
 * Supabase Auth reports a user's phone without its "+" ("14075551234"), while
 * the backend's registration check takes E.164 and answers 400 invalid_phone
 * to anything else — which the login screens showed as "We couldn't check that
 * number" for a patient who was already signed in. The digits, plus restored.
 */
export function sessionPhoneE164(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}
