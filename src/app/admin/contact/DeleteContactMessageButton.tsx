"use client";

import { deleteContactMessage } from "@/lib/contact/actions";

export default function DeleteContactMessageButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteContactMessage}
      onSubmit={(e) => {
        if (!confirm(`Supprimer définitivement le message de ${name} ?`)) e.preventDefault();
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
