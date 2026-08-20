"use client";

import { deleteTestimonial } from "@/lib/testimonials/actions";

export default function DeleteTestimonialButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteTestimonial}
      onSubmit={(e) => {
        if (!confirm(`Supprimer définitivement le témoignage de ${name} ?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="border border-err px-3 py-1.5 text-xs font-bold text-err hover:bg-err hover:text-paper"
      >
        Supprimer
      </button>
    </form>
  );
}
