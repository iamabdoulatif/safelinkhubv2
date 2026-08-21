"use client";

import { useActionState, useState } from "react";
import { X } from "lucide-react";
import { createExpense } from "@/lib/expenses/actions";
import type { AdminDictionary } from "@/lib/i18n/admin";

const CATEGORIES = [
  { value: "Internet / Bande passante", key: "bandwidth" },
  { value: "Électricité", key: "electricity" },
  { value: "Équipement", key: "equipment" },
  { value: "Loyer", key: "rent" },
  { value: "Salaires", key: "salaries" },
  { value: "Maintenance", key: "maintenance" },
  { value: "Autre", key: "other" },
] as const;

type ExpenseCopy = AdminDictionary["finance"]["expenses"];

export default function AddExpenseModal({ t }: { t: ExpenseCopy["modal"] & Pick<ExpenseCopy, "categories"> }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createExpense, undefined);

  // Close the modal the moment the action succeeds — adjusted during render
  // (the React-recommended alternative to setState-in-effect) by tracking
  // the previous action result and reacting only when it actually changes.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.success) setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-slate-deep-line"
      >
        {t.open}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            action={formAction}
            className="max-h-[90dvh] overflow-y-auto w-full max-w-sm rounded-xl bg-paper p-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">
                {t.title}
              </h2>
              <button type="button" onClick={() => setOpen(false)}>
                <X className="h-5 w-5 text-ink-soft" />
              </button>
            </div>

            {state?.error && (
              <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                {state.error}
              </p>
            )}

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  {t.category}
                </label>
                <select
                  name="category"
                  required
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.value}>
                      {t.categories[c.key]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  {t.amount}
                </label>
                <input
                  name="amount"
                  type="number"
                  min={1}
                  required
                  placeholder="10000"
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  {t.date}
                </label>
                <input
                  name="expenseDate"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  {t.note}
                </label>
                <input
                  name="note"
                  placeholder={t.notePlaceholder}
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-line-soft px-4 py-2 text-sm font-medium text-ink-soft hover:bg-clay"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-slate-deep-line disabled:opacity-60"
              >
                {pending ? t.pending : t.submit}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
