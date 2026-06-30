import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-bold text-slate-200">404</p>
      <h1 className="mt-3 text-xl font-semibold text-slate-900">Page introuvable</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        Cette page n&apos;existe pas ou a été déplacée.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
      >
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
