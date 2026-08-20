"use client";

import { useActionState, useState } from "react";
import { Star, CheckCircle2, AlertCircle } from "lucide-react";
import { submitTestimonial } from "@/lib/testimonials/actions";

export default function TestimonialForm() {
  const [state, formAction, pending] = useActionState(submitTestimonial, undefined);
  const [rating, setRating] = useState(5);

  if (state?.success) {
    return (
      <div className="slate-card mx-auto max-w-xl bg-paper p-6 text-center">
        <CheckCircle2 aria-hidden="true" className="mx-auto h-8 w-8 text-ok" />
        <p className="mt-3 font-display text-lg font-semibold text-ink">Merci !</p>
        <p className="mt-1 text-sm text-ink-soft">
          Votre témoignage a bien été envoyé. Il apparaîtra ici après validation.
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="slate-card mx-auto max-w-xl bg-paper p-6 sm:p-7"
    >
      <h3 className="font-display text-xl font-bold text-ink">Partagez votre témoignage</h3>
      <p className="mt-1 text-sm text-ink-soft">
        Vous utilisez SafeLinkHub ? Dites-nous ce que vous en pensez.
      </p>

      {state?.error && (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-err/40 bg-err/5 px-3 py-2 text-sm text-err">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </p>
      )}

      {/* Honeypot anti-spam — masqué aux humains. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Nom *</span>
          <input
            name="name"
            required
            maxLength={120}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-slate-deep focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Rôle</span>
          <input
            name="role"
            maxLength={120}
            placeholder="Opérateur FAI, gérant de hotspot…"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm placeholder:text-ink-soft focus:border-slate-deep focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-medium text-ink">Entreprise</span>
        <input
          name="company"
          maxLength={160}
          className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-slate-deep focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>

      <div className="mt-4">
        <span className="mb-1 block text-sm font-medium text-ink">Note</span>
        <input type="hidden" name="rating" value={rating} />
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => {
            const value = i + 1;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                aria-label={`${value} étoile${value > 1 ? "s" : ""}`}
                className="p-0.5"
              >
                <Star
                  className={`h-6 w-6 ${value <= rating ? "fill-brand text-brand" : "text-line"}`}
                />
              </button>
            );
          })}
        </div>
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-medium text-ink">Votre témoignage *</span>
        <textarea
          name="quote"
          required
          maxLength={600}
          rows={4}
          className="w-full resize-y rounded-lg border border-line px-3 py-2 text-sm focus:border-slate-deep focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 slate-btn slate-btn-primary mt-5 w-full px-6 py-3 text-sm disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Envoi…" : "Envoyer mon témoignage"}
      </button>
    </form>
  );
}
