"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-red-100 bg-paper p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <AlertTriangle aria-hidden="true" className="h-6 w-6 text-red-500" />
        </div>

        <h1 className="mt-4 text-base font-semibold text-ink">
          Impossible de charger cette page
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Une erreur s&apos;est produite lors du chargement. Vérifiez votre connexion
          puis réessayez.
        </p>

        {error.digest && (
          <p className="mt-3 rounded-md bg-clay px-3 py-1.5 font-mono text-xs text-ink-soft">
            {error.digest}
          </p>
        )}

        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-deep-line"
          >
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
            Réessayer
          </button>
          <Link
            href="/admin"
            className="rounded-full border border-line-soft px-4 py-2 text-sm font-semibold text-ink hover:bg-clay"
          >
            Tableau de bord
          </Link>
        </div>
      </div>
    </div>
  );
}
