"use client";

import { deleteBlogPost } from "@/lib/blog/actions";

export default function DeleteBlogPostButton({ id, title }: { id: string; title: string }) {
  return (
    <form
      action={deleteBlogPost}
      onSubmit={(e) => {
        if (!confirm(`Supprimer définitivement « ${title} » ?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="border-2 border-err px-3 py-1.5 text-xs font-bold text-err hover:bg-err hover:text-paper"
      >
        Supprimer
      </button>
    </form>
  );
}
