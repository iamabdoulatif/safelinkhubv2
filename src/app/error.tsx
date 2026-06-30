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
      <p className="text-5xl font-bold text-slate-200">500</p>
      <h1 className="mt-3 text-xl font-semibold text-slate-900">
        Quelque chose a mal tourné
      </h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        Une erreur inattendue s&apos;est produite. Si le problème persiste, contactez le
        support SafeLinkHub.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-slate-400">
          Réf. : {error.digest}
        </p>
      )}
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Réessayer
        </button>
        <Link
          href="/"
          className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Accueil
        </Link>
      </div>
    </div>
  );
}
