import { redirect } from "next/navigation";

export const instant = false;

export default async function ReviewRedirectPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  redirect(`/en/review/${encodeURIComponent(userId)}`);
}
