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
    <form ref={formRef} action={formAction} className="border border-line bg-paper p-6 rounded-xl">
      <h2 className="font-semibold text-ink">Envoyer une demande</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Décrivez votre problème — votre demande est enregistrée et visible dans la liste
        ci-dessous avec son statut.
      </p>

      {state?.error && (
        <p className="mt-4 rounded-md bg-err-soft px-3 py-2 text-sm text-err">{state.error}</p>
      )}
      {state?.success && (
        <p className="mt-4 rounded-md bg-clay px-3 py-2 text-sm text-ok">
          Demande envoyée.
        </p>
      )}

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Sujet</label>
          <input
            name="subject"
            required
            placeholder="Ex : Le portail captif ne s'affiche pas"
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Message</label>
          <textarea
            name="message"
            required
            rows={4}
            placeholder="Décrivez ce qui se passe, depuis quand, et sur quel routeur si pertinent."
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-slate-deep-line disabled:opacity-60"
      >
        {pending ? "Envoi..." : "Envoyer"}
      </button>
    </form>
  );
}
