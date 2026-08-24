import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-bold text-line-soft">404</p>
      <h1 className="mt-3 text-xl font-semibold text-ink">Page introuvable</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-soft">
        Cette page n&apos;existe pas ou a été déplacée.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-soft"
      >
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
