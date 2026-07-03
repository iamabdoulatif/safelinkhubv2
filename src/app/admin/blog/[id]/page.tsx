import { notFound, redirect } from "next/navigation";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getPostById } from "@/lib/blog/queries";
import BlogPostForm from "../BlogPostForm";

export default async function EditBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) redirect("/admin");

  const { id } = await params;
  const post = await getPostById(id);
  if (!post) notFound();

  return (
    <div className="animate-fade-in-up">
      <h1 className="text-2xl font-bold text-ink">Modifier l&apos;article</h1>
      <p className="mt-1 text-sm text-ink-soft">
        {post.published
          ? "Cet article est publié — les modifications seront visibles immédiatement sur /blog."
          : "Brouillon — invisible sur le site public tant qu'il n'est pas publié."}
      </p>
      <div className="mt-4">
        <BlogPostForm post={post} />
      </div>
    </div>
  );
}
