import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { listAllPosts } from "@/lib/blog/queries";
import { toggleBlogPostPublished } from "@/lib/blog/actions";
import DeleteBlogPostButton from "./DeleteBlogPostButton";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default async function AdminBlogPage() {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) redirect("/admin");

  const posts = await listAllPosts();

  return (
    <div className="animate-fade-in-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Blog</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Articles du blog public de la plateforme — visibles sur /blog une
            fois publiés.
          </p>
        </div>
        <Link
          href="/admin/blog/new"
          className="flex items-center gap-2 border-2 border-line bg-brand px-4 py-2 text-sm font-bold text-[#1C1917] hover:bg-ink hover:text-paper"
        >
          <Plus className="h-4 w-4" />
          Nouvel article
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="mt-6 border-2 border-line bg-paper p-8 text-center">
          <p className="font-semibold text-ink">Aucun article.</p>
          <p className="mt-1 text-sm text-ink-soft">
            Créez votre premier article avec le bouton « Nouvel article ».
          </p>
        </div>
      ) : (
        <>
          {/* Mobile : cartes empilées */}
          <div className="mt-4 space-y-3 md:hidden">
            {posts.map((post) => (
              <div key={post.id} className="border-2 border-line bg-paper p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{post.title}</p>
                    <p className="truncate font-mono text-xs text-ink-soft">/blog/{post.slug}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      post.published ? "bg-brand text-[#1C1917]" : "bg-clay text-ink-soft"
                    }`}
                  >
                    {post.published ? "Publié" : "Brouillon"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-ink-soft">
                  Modifié le {formatDate(post.updatedAt)}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
                  <Link
                    href={`/admin/blog/${post.id}`}
                    className="border-2 border-line px-3 py-1.5 text-xs font-bold text-ink hover:bg-clay"
                  >
                    Modifier
                  </Link>
                  <form action={toggleBlogPostPublished}>
                    <input type="hidden" name="id" value={post.id} />
                    <button
                      type="submit"
                      className="border-2 border-line px-3 py-1.5 text-xs font-bold text-ink hover:bg-clay"
                    >
                      {post.published ? "Dépublier" : "Publier"}
                    </button>
                  </form>
                  <DeleteBlogPostButton id={post.id} title={post.title} />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop : tableau */}
          <div className="mt-4 hidden overflow-x-auto border-2 border-line bg-paper md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line-soft bg-clay text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">Titre</th>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Modifié le</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {posts.map((post) => (
                  <tr key={post.id}>
                    <td className="px-4 py-3 font-medium text-ink">{post.title}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-soft">
                      {post.published ? (
                        <a
                          href={`/blog/${post.slug}`}
                          target="_blank"
                          className="hover:underline"
                        >
                          /blog/{post.slug}
                        </a>
                      ) : (
                        <>/blog/{post.slug}</>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          post.published ? "bg-brand text-[#1C1917]" : "bg-clay text-ink-soft"
                        }`}
                      >
                        {post.published ? "Publié" : "Brouillon"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{formatDate(post.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/blog/${post.id}`}
                          className="border-2 border-line px-3 py-1.5 text-xs font-bold text-ink hover:bg-clay"
                        >
                          Modifier
                        </Link>
                        <form action={toggleBlogPostPublished}>
                          <input type="hidden" name="id" value={post.id} />
                          <button
                            type="submit"
                            className="border-2 border-line px-3 py-1.5 text-xs font-bold text-ink hover:bg-clay"
                          >
                            {post.published ? "Dépublier" : "Publier"}
                          </button>
                        </form>
                        <DeleteBlogPostButton id={post.id} title={post.title} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
