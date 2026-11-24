import { getCaseSummary } from "@/services/intake";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CaseSummaryScreen } from "@/components/case-summary/case-summary-screen";

export const instant = false;

// Case Summary — the patient's own submitted case, opened from the dashboard's
// View Case Summary. What it shows and whether it can still be changed both
// come from the backend (GET /case/:submissionId); the screen only edits a
// draft and sends it to POST /case/:submissionId on Save.
export default async function CasePage({ params }: { params: Promise<{ locale: string; submissionId: string }> }) {
  const { locale, submissionId } = await params;

  // Rendered on the server, so the session comes from the request cookies the
  // Supabase client wrote at sign-in rather than from a browser client. Without
  // one the backend refuses, and an unowned case is indistinguishable from a
  // missing one — both land on notFound().
  const {
    data: { session },
  } = await (await createClient()).auth.getSession();

  let summary;
  try {
    summary = await getCaseSummary(submissionId, session?.access_token);
  } catch {
    notFound();
  }

  return (
    <CaseSummaryScreen
      locale={locale}
      initialSummary={summary}
    />
  );
}
