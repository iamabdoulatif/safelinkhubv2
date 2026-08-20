"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitContactMessage } from "@/lib/contact/actions";

export default function ContactForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(submitContactMessage, undefined);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="border border-line bg-paper p-6">
      {state?.error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="mb-4 rounded-md bg-clay px-3 py-2 text-sm text-ok">
          Message envoyé — merci, nous revenons vers vous rapidement.
        </p>
      )}

      {/* Honeypot anti-spam : invisible pour les humains, rempli par les bots. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className="mb-1 block text-sm font-medium text-ink">
            Nom
          </label>
          <input
            id="contact-name"
            name="name"
            required
            placeholder="Votre nom"
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-slate-deep focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label htmlFor="contact-email" className="mb-1 block text-sm font-medium text-ink">
            Email
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            placeholder="vous@exemple.com"
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-slate-deep focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="contact-subject" className="mb-1 block text-sm font-medium text-ink">
          Sujet <span className="font-normal text-ink-soft">(optionnel)</span>
        </label>
        <input
          id="contact-subject"
          name="subject"
          placeholder="Ex : Déploiement multi-sites"
          className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-slate-deep focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div className="mt-4">
        <label htmlFor="contact-message" className="mb-1 block text-sm font-medium text-ink">
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={6}
          maxLength={5000}
          placeholder="Décrivez votre besoin…"
          className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-slate-deep focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="slate-btn slate-btn-primary mt-5 inline-flex items-center justify-center gap-2 px-6 py-3 text-sm disabled:opacity-60"
      >
        {pending ? "Envoi…" : "Envoyer le message"}
      </button>
    </form>
  );
}
