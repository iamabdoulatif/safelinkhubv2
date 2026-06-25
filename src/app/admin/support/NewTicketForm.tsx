"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createSupportTicket } from "@/lib/support/actions";

export default function NewTicketForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(createSupportTicket, undefined);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="font-semibold text-slate-900">Envoyer une demande</h2>
      <p className="mt-1 text-sm text-slate-500">
        Décrivez votre problème — votre demande est enregistrée et visible dans la liste
        ci-dessous avec son statut.
      </p>

      {state?.error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}
      {state?.success && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Demande envoyée.
        </p>
      )}

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Sujet</label>
          <input
            name="subject"
            required
            placeholder="Ex : Le portail captif ne s'affiche pas"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Message</label>
          <textarea
            name="message"
            required
            rows={4}
            placeholder="Décrivez ce qui se passe, depuis quand, et sur quel routeur si pertinent."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Envoi..." : "Envoyer"}
      </button>
    </form>
  );
}
