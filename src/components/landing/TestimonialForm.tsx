"use client";

import { useActionState, useState } from "react";
import { Star, CheckCircle2, AlertCircle } from "lucide-react";
import { submitTestimonial } from "@/lib/testimonials/actions";

export default function TestimonialForm() {
  const [state, formAction, pending] = useActionState(submitTestimonial, undefined);
  const [rating, setRating] = useState(5);

  if (state?.success) {
    return (
      <div className="mx-auto max-w-xl border-2 border-line bg-paper p-6 text-center">
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
      className="mx-auto max-w-xl border-2 border-line bg-paper p-6 sm:p-7"
    >
      <h3 className="font-display text-xl font-bold text-ink">Partagez votre témoignage</h3>
      <p className="mt-1 text-sm text-ink-soft">
        Vous utilisez SafeLinkHub ? Dites-nous ce que vous en pensez.
      </p>

      {state?.error && (
        <p className="mt-4 flex items-center gap-2 border-2 border-err/40 bg-err/5 px-3 py-2 text-sm text-err">
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
            className="w-full border-2 border-line-soft px-3 py-2 text-sm focus:border-ink focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Rôle</span>
          <input
            name="role"
            maxLength={120}
            placeholder="Opérateur FAI, gérant de hotspot…"
            className="w-full border-2 border-line-soft px-3 py-2 text-sm placeholder:text-ink-soft focus:border-ink focus:outline-none"
          />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-medium text-ink">Entreprise</span>
        <input
          name="company"
          maxLength={160}
          className="w-full border-2 border-line-soft px-3 py-2 text-sm focus:border-ink focus:outline-none"
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
          className="w-full resize-y border-2 border-line-soft px-3 py-2 text-sm focus:border-ink focus:outline-none"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-5 w-full border-2 border-line bg-brand px-5 py-3 text-sm font-bold text-[#1C1917] hover:bg-ink hover:text-paper disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Envoi…" : "Envoyer mon témoignage"}
      </button>
    </form>
  );
}
