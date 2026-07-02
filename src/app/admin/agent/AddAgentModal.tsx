"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { createAgent } from "@/lib/agents/actions";

export default function AddAgentModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createAgent, undefined);

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.success) setOpen(false);
  }

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [state, router]);

  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      firstInputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const active = document.activeElement;
        if (active instanceof HTMLSelectElement) return;
        setOpen(false);
      }
    }
    if (open) {
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-brand"
      >
        + Ajouter un agent
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <form
            action={formAction}
            className="relative w-full max-w-md rounded-xl bg-paper p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-agent-title"
          >
            <div className="flex items-center justify-between">
              <h2 id="add-agent-title" className="text-lg font-semibold text-ink">Ajouter un agent</h2>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5 text-ink-soft" />
              </button>
            </div>

            <div className="mt-4" aria-live="polite">
              {state?.error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                  <span className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {state.error}
                  </span>
                </p>
              )}
              {state?.success && (
                <p className="rounded-md bg-clay px-3 py-2 text-sm text-ok">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Agent ajouté avec succès.
                  </span>
                </p>
              )}
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Nom</label>
                <input
                  ref={firstInputRef}
                  name="name"
                  required
                  placeholder="Aïcha Koné"
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:ring-2 focus:ring-ink/20 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Email</label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="aicha@example.com"
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:ring-2 focus:ring-ink/20 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  Mot de passe
                </label>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  placeholder="Au moins 6 caractères"
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:ring-2 focus:ring-ink/20 focus:outline-none"
                />
                <p className="mt-1 text-xs text-ink-soft">
                  L&apos;agent pourra s&apos;en servir pour se connecter plus tard si vous lui
                  donnez accès au tableau de bord.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-line-soft px-4 py-2 text-sm font-medium text-ink-soft hover:bg-clay"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-brand disabled:opacity-60"
              >
                {pending ? "Ajout..." : "Ajouter l'agent"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
