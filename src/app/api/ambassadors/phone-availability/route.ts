import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const SUPABASE_URL_VAR = "NEXT_PUBLIC_SUPABASE_URL";
const SERVICE_ROLE_KEY_VAR = "SUPABASE_SERVICE_ROLE_KEY";

type PhoneAvailabilityRequest = {
  phone?: string;
};

function normalizePhone(input: string): string {
  const digits = input.trim().replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as PhoneAvailabilityRequest;
  const normalizedPhone = normalizePhone(body.phone ?? "");

  if (!normalizedPhone) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [...(supabaseUrl ? [] : [SUPABASE_URL_VAR]), ...(serviceRoleKey ? [] : [SERVICE_ROLE_KEY_VAR])];

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[ambassadors.phone-availability] config:error", { missing });
    return NextResponse.json(
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
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("phone", normalizedPhone)
      .limit(1);

    if (profileError) {
      console.error("[ambassadors.phone-availability] profiles lookup:error", {
        message: profileError.message,
        code: profileError.code,
      });
      return NextResponse.json({ error: "lookup_failed" }, { status: 502 });
    }

    const userId = profiles?.[0]?.user_id;
    if (!userId) {
      return NextResponse.json({ available: true, reason: "available" }, { status: 200 });
    }

    const { data: ambassadorProfile, error: ambassadorError } = await supabase
      .from("ambassador_profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (ambassadorError) {
      console.error("[ambassadors.phone-availability] ambassador lookup:error", {
        message: ambassadorError.message,
        code: ambassadorError.code,
      });
      return NextResponse.json({ error: "lookup_failed" }, { status: 502 });
    }

    return NextResponse.json(
      { available: !ambassadorProfile, reason: ambassadorProfile ? "taken" : "available" },
      { status: 200 }
    );
  } catch (error) {
    console.error("[ambassadors.phone-availability] lookup:unreachable", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "lookup_failed" }, { status: 502 });
  }
}
