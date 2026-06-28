import { Database } from "lucide-react";

const kpis = [
  { label: "Ventes nettes", value: "FCFA 0", sub: "1 Mar - 27 Mar" },
  { label: "Ventes de vouchers", value: "FCFA 0", sub: "Total des ventes via vouchers physiques" },
  { label: "Crédit du compte", value: "FCFA 0", sub: "Solde prépayé net" },
];

export default function DashboardPage() {
  return (
    <div className="animate-fade-in-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Tableau de bord</h1>
        <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
          1 Mars 2026 - 27 Mars 2026
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className={`rounded-xl border border-slate-200 bg-white p-4 hover-lift delay-${(i + 1) * 100}`}
          >
            <p className="text-sm text-slate-500">{k.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {k.value}
            </p>
            <p className="mt-1 text-xs text-slate-400">{k.sub}</p>
          </div>
        ))}
        <div className={`flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-4 text-center hover-lift delay-400`}>
          <Database className="h-5 w-5 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-500">
            Indicateurs système indisponibles
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Les métriques système sont temporairement indisponibles. Veuillez
            réessayer plus tard.
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Aperçu</h2>
              <p className="text-xs text-slate-400">1 Mars 2026 - 27 Mars 2026</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="rounded-md bg-slate-950 px-3 py-1 text-xs font-medium text-white">
                Totaux
              </button>
              <button className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200">
                Tout...
              </button>
            </div>
          </div>
          <div className="mt-6 flex h-48 items-center justify-center text-sm text-slate-400">
            Aucune donnée pour cette période
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Revenu
              net
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-900" /> Commission
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Dépense
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-orange-500" /> Revenu
              brut
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">Ventes récentes</h2>
          <p className="mt-6 text-sm text-slate-400">
            Vous n&apos;avez fait aucune vente aujourd&apos;hui.
          </p>
        </div>
      </div>
    </div>
  );
}
