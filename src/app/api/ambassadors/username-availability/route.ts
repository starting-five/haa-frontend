import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._]{2,29}$/;

// The check runs before the ambassador has a session and anon holds no grant on
// ambassador_profiles, so the service role key is a requirement rather than a
// fallback — falling back to the cookie-scoped client made a missing key look
// like a malformed username.
const SUPABASE_URL_VAR = "NEXT_PUBLIC_SUPABASE_URL";
const SERVICE_ROLE_KEY_VAR = "SUPABASE_SERVICE_ROLE_KEY";

function normalizeUsername(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._]+/g, "");
}

type UsernameAvailabilityRequest = {
  username?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as UsernameAvailabilityRequest;
  const normalizedUsername = normalizeUsername(body.username ?? "");

  if (!USERNAME_PATTERN.test(normalizedUsername)) {
    return NextResponse.json({ error: "invalid_username" }, { status: 400 });
  }

  // read as literals — the bundler only inlines NEXT_PUBLIC_* at this exact spelling
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [...(supabaseUrl ? [] : [SUPABASE_URL_VAR]), ...(serviceRoleKey ? [] : [SERVICE_ROLE_KEY_VAR])];

  if (!supabaseUrl || !serviceRoleKey) {
    // names only — the key value never reaches a log or a response
    console.error("[ambassadors.username-availability] config:error", { missing });
    return NextResponse.json(
      // the variable names help a developer fix the environment; production is
      // told only that something is wrong
      { error: "configuration_error", ...(process.env.NODE_ENV === "production" ? {} : { missing }) },
      { status: 503 }
    );
  }

  const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    const { data, error } = await supabase
      .from("ambassador_profiles")
      .select("user_id")
      .eq("username", normalizedUsername)
      .maybeSingle();

    if (error) {
      console.error("[ambassadors.username-availability] lookup:error", {
        message: error.message,
        code: error.code,
      });
      return NextResponse.json({ error: "lookup_failed" }, { status: 502 });
    }

    return NextResponse.json({ available: !data, reason: data ? "taken" : "available" }, { status: 200 });
  } catch (error) {
    // supabase-js throws rather than returning an error when the request itself
    // fails — a reachability problem, not a verdict on the username
    console.error("[ambassadors.username-availability] lookup:unreachable", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "lookup_failed" }, { status: 502 });
  }
}
