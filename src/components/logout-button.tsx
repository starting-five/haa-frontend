"use client";

import { createClient } from "@/lib/supabase/client";
import { clearAmbassadorSession } from "@/lib/ambassador-session";
import { clearIntakeSession, preserveIntakeResumeDraft } from "@/lib/intake-session";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    clearAmbassadorSession(window.sessionStorage);
    preserveIntakeResumeDraft(window.sessionStorage);
    clearIntakeSession(window.sessionStorage);
    router.push("/auth/login");
  };

  return <Button onClick={logout}>Logout</Button>;
}
