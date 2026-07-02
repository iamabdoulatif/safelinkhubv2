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
        <h1 className="text-2xl font-bold text-ink">Tableau de bord</h1>
        <button className="rounded-md border border-line-soft bg-paper px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-clay">
          1 Mars 2026 - 27 Mars 2026
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className={`border-2 border-line bg-paper p-4 hover-lift delay-${(i + 1) * 100}`}
          >
            <p className="text-sm text-ink-soft">{k.label}</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {k.value}
            </p>
            <p className="mt-1 text-xs text-ink-soft">{k.sub}</p>
          </div>
        ))}
        <div className={`flex flex-col items-center justify-center border-2 border-line bg-paper p-4 text-center hover-lift delay-400`}>
          <Database className="h-5 w-5 text-clay" />
          <p className="mt-2 text-sm font-medium text-ink-soft">
            Indicateurs système indisponibles
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            Les métriques système sont temporairement indisponibles. Veuillez
            réessayer plus tard.
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="border-2 border-line bg-paper p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-ink">Aperçu</h2>
              <p className="text-xs text-ink-soft">1 Mars 2026 - 27 Mars 2026</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="rounded-md bg-ink px-3 py-1 text-xs font-medium text-white">
                Totaux
              </button>
              <button className="rounded-md border border-line-soft px-3 py-1 text-xs font-medium text-ink-soft hover:bg-clay hover:text-ok hover:border-ok">
                Tout...
              </button>
            </div>
          </div>
          <div className="mt-6 flex h-48 items-center justify-center text-sm text-ink-soft">
            Aucune donnée pour cette période
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-6 text-xs text-ink-soft">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-ok" /> Revenu
              net
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-ink" /> Commission
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

        <div className="border-2 border-line bg-paper p-4">
          <h2 className="font-semibold text-ink">Ventes récentes</h2>
          <p className="mt-6 text-sm text-ink-soft">
            Vous n&apos;avez fait aucune vente aujourd&apos;hui.
          </p>
        </div>
      </div>
    </div>
  );
}
