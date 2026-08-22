"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteCourse } from "@/lib/courses/actions";

export default function DeleteCourseButton({ id }: { id: string }) {
  const [confirme, setConfirme] = useState(false);
  if (!confirme) {
    return (
      <button
        type="button"
        onClick={() => setConfirme(true)}
        title="Supprimer cette formation"
        className="rounded-md border border-line p-1.5 text-red-700 hover:bg-red-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    );
  }
  return (
    <form action={deleteCourse} className="flex gap-1.5">
      <input type="hidden" name="id" value={id} />
      {/* Les leçons partent avec elle : la clé étrangère est en cascade. */}
      <button className="rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-bold text-white">
        Confirmer
      </button>
      <button
        type="button"
        onClick={() => setConfirme(false)}
        className="rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft"
      >
        Annuler
      </button>
    </form>
  );
}
