import Link from "next/link";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import CourseForm from "../CourseForm";

export default async function NewCoursePage() {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) {
    return <p className="text-sm text-ink-soft">Accès réservé au superadmin.</p>;
  }
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/formations" className="text-sm text-brand-deep hover:underline">
        ← Formations
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-ink">Nouvelle formation</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Les leçons se saisissent après la création, sur la fiche du parcours.
      </p>
      <CourseForm course={null} />
    </div>
  );
}
