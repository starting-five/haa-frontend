export function normalizeApiUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_USE_API_PROXY === "true") {
    return "/api/backend";
  }
  return normalizeApiUrl(process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000");
}
