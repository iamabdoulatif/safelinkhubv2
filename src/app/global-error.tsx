"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body className="flex min-h-screen items-center justify-center bg-clay p-4 font-sans text-ink antialiased">
        <div className="w-full max-w-sm text-center">
          <p className="text-4xl font-bold text-line-soft">500</p>
          <h1 className="mt-2 text-lg font-semibold text-ink">
            Une erreur inattendue s&apos;est produite
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            Quelque chose a mal tourné au niveau de l&apos;application. L&apos;équipe a
            été notifiée.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-soft"
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
