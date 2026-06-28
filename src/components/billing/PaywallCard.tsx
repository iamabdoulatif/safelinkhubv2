import Link from "next/link";
import { ArrowRight, Lock, Wallet } from "lucide-react";

function fcfa(cents: number) {
  return `${cents.toLocaleString("fr-FR")} FCFA`;
}

/**
 * Shown wherever the org's one free auto-setup trial is already spent and
 * a feature now needs to be paid from the wallet — see
 * lib/billing/auto-setup-pricing.ts. Payment gateways (mobile money, card
 * via Genius Pay) aren't wired in yet, so the only working path today is
 * the manual wallet top-up on /admin/billing; that's stated plainly here
 * rather than offering buttons that don't do anything.
 */
export default function PaywallCard({
  title,
  description,
  feeCents,
  walletBalanceCents,
  sufficientBalance,
}: {
  title: string;
  description: string;
  feeCents: number;
  walletBalanceCents: number;
  sufficientBalance: boolean;
}) {
  return (
    <div className="animate-fade-slide-up overflow-hidden rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <Lock className="h-4.5 w-4.5" />
        </span>
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-white px-3 py-2.5 ring-1 ring-slate-100">
          <p className="text-xs text-slate-400">Frais unique</p>
          <p className="mt-0.5 font-semibold text-slate-900">{fcfa(feeCents)}</p>
        </div>
        <div className="rounded-lg bg-white px-3 py-2.5 ring-1 ring-slate-100">
          <p className="text-xs text-slate-400">Solde portefeuille</p>
          <p
            className={`mt-0.5 font-semibold ${sufficientBalance ? "text-emerald-600" : "text-red-600"}`}
          >
            {fcfa(walletBalanceCents)}
          </p>
        </div>
      </div>

      {sufficientBalance ? (
        <p className="mt-4 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-700">
          <Wallet className="h-3.5 w-3.5" />
          Solde suffisant — ce montant sera débité au lancement de l&apos;auto-setup.
        </p>
      ) : (
        <>
          <Link
            href="/admin/billing"
            className="group mt-4 flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            <Wallet className="h-4 w-4" />
            Recharger mon portefeuille
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            Mobile money / carte (Genius Pay) — bientôt disponible directement ici.
          </p>
        </>
      )}
    </div>
  );
}
