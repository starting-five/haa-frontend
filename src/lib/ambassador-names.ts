// Shared boundary check for name fields that came from a client request or
// auth metadata fallback — an email should never be stored as a display/preferred name.
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
