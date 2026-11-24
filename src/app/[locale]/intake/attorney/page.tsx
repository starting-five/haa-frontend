import { redirect } from "next/navigation";

export default async function IntakeAttorneyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/intake/dashboard/attorney`);
}
