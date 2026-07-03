import { redirect } from "next/navigation";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import BlogPostForm from "../BlogPostForm";

export default async function NewBlogPostPage() {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) redirect("/admin");

  return (
    <div className="animate-fade-in-up">
      <h1 className="text-2xl font-bold text-ink">Nouvel article</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Rédigez l&apos;article puis cochez « Publier » quand il est prêt — un
        brouillon reste invisible sur le site public.
      </p>
      <div className="mt-4">
        <BlogPostForm />
      </div>
    </div>
  );
}
