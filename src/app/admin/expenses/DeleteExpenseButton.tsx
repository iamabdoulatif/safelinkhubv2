"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteExpense } from "@/lib/expenses/actions";
import type { AdminDictionary } from "@/lib/i18n/admin";

export default function DeleteExpenseButton({
  expenseId,
  title,
}: {
  expenseId: string;
  title: AdminDictionary["finance"]["expenses"]["modal"]["delete"];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await deleteExpense(expenseId);
          router.refresh();
        })
      }
      className="text-ink-soft hover:text-red-600 disabled:opacity-50"
      title={title}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
