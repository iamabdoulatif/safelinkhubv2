"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitContactMessage } from "@/lib/contact/actions";
import type { Dictionary } from "@/lib/i18n/fr";

export default function ContactForm({
  locale,
  t,
}: {
  locale: "fr" | "en";
  t: Dictionary["contact"]["form"];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(submitContactMessage, undefined);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="border border-line bg-paper p-6">
      <input type="hidden" name="locale" value={locale} />
      {state?.error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="mb-4 rounded-md bg-clay px-3 py-2 text-sm text-ok">
          {t.success}
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
            {t.name}
          </label>
          <input
            id="contact-name"
            name="name"
            required
            placeholder={t.namePlaceholder}
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-slate-deep focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label htmlFor="contact-email" className="mb-1 block text-sm font-medium text-ink">
            {t.email}
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            placeholder={t.emailPlaceholder}
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-slate-deep focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="contact-subject" className="mb-1 block text-sm font-medium text-ink">
          {t.subject} <span className="font-normal text-ink-soft">({t.optional})</span>
        </label>
        <input
          id="contact-subject"
          name="subject"
          placeholder={t.subjectPlaceholder}
          className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-slate-deep focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div className="mt-4">
        <label htmlFor="contact-message" className="mb-1 block text-sm font-medium text-ink">
          {t.message}
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={6}
          maxLength={5000}
          placeholder={t.messagePlaceholder}
          className="w-full rounded-lg border border-line px-3 py-2.5 text-sm focus:border-slate-deep focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="slate-btn slate-btn-primary mt-5 inline-flex items-center justify-center gap-2 px-6 py-3 text-sm disabled:opacity-60"
      >
        {pending ? t.sending : t.submit}
      </button>
    </form>
  );
}
