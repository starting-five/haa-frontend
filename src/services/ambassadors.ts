import { z } from "zod";

// Ambassador calls that go through this app's own route handlers. The username
// screen used to fetch inline and collapse every failure into one message —
// keeping the call here lets the screen switch on an outcome instead of a
// status code, the way src/services/intake.ts does for the intake flow.

const USERNAME_AVAILABILITY_PATH = "/api/ambassadors/username-availability";

const availabilityResponseSchema = z.object({
  available: z.boolean(),
  reason: z.enum(["available", "taken"]),
});

const availabilityErrorSchema = z.object({
  error: z.string(),
  // the names of the environment variables the server is missing — never their
  // values, and only sent outside production
  missing: z.array(z.string()).optional(),
});

export type UsernameAvailability =
  | { status: "available" }
  | { status: "taken" }
  | { status: "invalid" }
  | { status: "misconfigured"; missing: string[] }
  | { status: "unavailable" };

// Five outcomes, one per failure the ambassador can act on differently: their
// username is malformed, it belongs to someone else, it is free, the server is
// missing configuration, or the check itself could not run.
export async function checkUsernameAvailability(username: string): Promise<UsernameAvailability> {
  let response: Response;

  try {
    response = await fetch(USERNAME_AVAILABILITY_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
  } catch {
    // the request never reached the route — offline, DNS, aborted
    return { status: "unavailable" };
  }

  const body = await response.json().catch(() => null);

  if (response.ok) {
    const parsed = availabilityResponseSchema.safeParse(body);
    // an OK response that does not answer the question is an outage, not a verdict
    if (!parsed.success) return { status: "unavailable" };
    return parsed.data.available ? { status: "available" } : { status: "taken" };
  }

  const parsedError = availabilityErrorSchema.safeParse(body);
  const code = parsedError.success ? parsedError.data.error : null;

  if (response.status === 400 && code === "invalid_username") {
    return { status: "invalid" };
  }

  if (response.status === 503 && code === "configuration_error") {
    return { status: "misconfigured", missing: parsedError.success ? (parsedError.data.missing ?? []) : [] };
  }

  return { status: "unavailable" };
}
