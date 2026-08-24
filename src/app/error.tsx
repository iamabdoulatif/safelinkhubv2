"use client";

import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl font-bold text-line-soft">500</p>
      <h1 className="mt-3 text-xl font-semibold text-ink">
        Quelque chose a mal tourné
      </h1>
      <p className="mt-2 max-w-sm text-sm text-ink-soft">
        Une erreur inattendue s&apos;est produite. Si le problème persiste, contactez le
        support SafeLinkHub.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-ink-soft">
          Réf. : {error.digest}
        </p>
      )}
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-soft"
        >
          Réessayer
        </button>
        <Link
          href="/"
          className="rounded-full border border-line-soft px-5 py-2.5 text-sm font-semibold text-ink hover:bg-clay"
        >
          Accueil
        </Link>
      </div>
    </div>
  );
}
