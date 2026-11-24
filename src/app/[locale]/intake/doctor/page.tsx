import { redirect } from "next/navigation";

export default async function IntakeDoctorPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/intake/dashboard/doctor`);
}
