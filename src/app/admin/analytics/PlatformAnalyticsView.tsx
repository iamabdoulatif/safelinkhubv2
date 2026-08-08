"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Download,
  Gauge,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  UsersRound,
  WalletCards,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { buildPlatformSalesCsv, type PlatformAnalyticsReport, type PlatformSaleRow } from "@/lib/admin/platform-analytics";
import { formatFcfa, PAYMENT_METHODS } from "@/lib/billing/auto-setup-gate-config";
import LineChart from "@/components/charts/LineChart";
import { periodLabel, serviceLabel } from "@/lib/billing/remote-access-gate-config";

const paymentMethodLabels: Record<string, string> = {
  geniuspay: "GeniusPay",
};

function paymentMethodLabel(method: string) {
  return paymentMethodLabels[method] ?? PAYMENT_METHODS.find((item) => item.id === method)?.label ?? method;
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(
    new Date(year, month - 1, day),
  );
}

function percentLabel(value: number) {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}%`;
}

/**
 * Ventes VPN et Auto-Setup au fil des jours.
 *
 * Deux séries de barres accolées, dont l'une en `var(--ink)` — la couleur du
 * TEXTE : le mark se confondait avec la typographie environnante. En courbes,
 * chaque service garde sa propre pente et l'écart se lit d'un coup.
 */
function DailySalesChart({ report }: { report: PlatformAnalyticsReport }) {
  return (
    <LineChart
      labels={report.daily.map((point) => formatDay(point.day))}
      series={[
        {
          key: "vpn",
          label: "VPN",
          color: "var(--chart-1)",
          values: report.daily.map((point) => point.vpnAmountFcfa),
        },
        {
          key: "autosetup",
          label: "Auto-Setup",
          color: "var(--chart-2)",
          values: report.daily.map((point) => point.autoSetupAmountFcfa),
        },
      ]}
      unit="fcfa"
      ariaLabel="Ventes VPN et Auto-Setup par jour"
      emptyLabel="Aucune vente sur la période sélectionnée."
    />
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "yellow",
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof WalletCards;
  accent?: "yellow" | "green" | "ink" | "red";
}) {
  const accents = {
    yellow: "border-t-brand",
    green: "border-t-ok",
    ink: "border-t-ink",
    red: "border-t-err",
  } as const;
  return (
    <div className={`border-2 border-line border-t-4 bg-paper p-4 ${accents[accent]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">{label}</p>
        <Icon className="h-4 w-4 text-ink-soft" aria-hidden="true" />
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink-soft">{hint}</p>
    </div>
  );
}

export default function PlatformAnalyticsView({
  report,
  rows,
  rangeLabel,
}: {
  report: PlatformAnalyticsReport;
  rows: PlatformSaleRow[];
  rangeLabel: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const recentRows = useMemo(() => (showAll ? rows : rows.slice(0, 8)), [rows, showAll]);
  const maxMethodAmount = Math.max(...report.paymentMethods.map((item) => item.amountFcfa), 1);
  const maxServiceAmount = Math.max(...report.services.map((item) => item.amountFcfa), 1);

  function exportCsv() {
    const blob = new Blob([buildPlatformSalesCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `safelinkhub-ventes-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ok">
            <BarChart3 className="h-4 w-4" aria-hidden="true" /> Cockpit commercial · Superadmin
          </div>
          <h1 className="text-2xl font-bold text-ink">Analyse des ventes</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Suivez les encaissements VPN et Auto-Setup, leur activation et les demandes à traiter.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-[#3A362F] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" /> Exporter le rapport
          </button>
          <Link
            href="/admin/authorizations"
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm font-semibold text-ink hover:bg-clay"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Autorisations
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-l-4 border-brand bg-clay px-3 py-2.5 text-xs text-ink-soft">
        <Gauge className="h-4 w-4 text-ink" aria-hidden="true" />
        <span className="font-semibold text-ink">Période analysée :</span> {rangeLabel}
        <span className="text-ink-soft">· seuls les paiements validés alimentent le chiffre d’affaires.</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total encaissé"
          value={formatFcfa(report.kpis.totalAmountFcfa)}
          hint={`${report.kpis.approvedCount} vente(s) validée(s)`}
          icon={WalletCards}
          accent="yellow"
        />
        <MetricCard
          label="Ventes VPN"
          value={formatFcfa(report.kpis.vpnAmountFcfa)}
          hint={`${report.kpis.vpnSalesCount} accès distant(s)`}
          icon={KeyRound}
          accent="ink"
        />
        <MetricCard
          label="Auto-Setup"
          value={formatFcfa(report.kpis.autoSetupAmountFcfa)}
          hint={`${report.kpis.autoSetupSalesCount} configuration(s)`}
          icon={Zap}
          accent="green"
        />
        <MetricCard
          label="Organisations actives"
          value={String(report.kpis.activeOrganizations)}
          hint={`${percentLabel(report.kpis.activationRate)} des ventes activées`}
          icon={UsersRound}
          accent="yellow"
        />
      </div>

      {(report.kpis.pendingCount > 0 || report.kpis.unconsumedApprovedCount > 0 || report.kpis.rejectedCount > 0) && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            href="/admin/authorizations"
            className="group flex items-center gap-3 border-2 border-amber-200 bg-amber-50 p-3 hover:border-amber-300"
          >
            <Clock3 className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <span className="min-w-0 flex-1"><strong className="block text-sm text-amber-900">{report.kpis.pendingCount} en attente</strong><span className="text-xs text-amber-800">À valider ou refuser</span></span>
            <ArrowUpRight className="h-4 w-4 text-amber-700 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
          <Link
            href="/admin/vpn-access"
            className="group flex items-center gap-3 border-2 border-blue-200 bg-blue-50 p-3 hover:border-blue-300"
          >
            <CircleAlert className="h-5 w-5 shrink-0 text-blue-700" aria-hidden="true" />
            <span className="min-w-0 flex-1"><strong className="block text-sm text-blue-900">{report.kpis.unconsumedApprovedCount} non activée(s)</strong><span className="text-xs text-blue-800">Paiements validés à suivre</span></span>
            <ArrowUpRight className="h-4 w-4 text-blue-700 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
          <div className="flex items-center gap-3 border-2 border-red-200 bg-red-50 p-3">
            <CircleAlert className="h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
            <span><strong className="block text-sm text-red-900">{report.kpis.rejectedCount} refusée(s)</strong><span className="text-xs text-red-800">Demandes non encaissées</span></span>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
        <section className="border-2 border-line bg-paper p-4" aria-labelledby="sales-evolution-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="sales-evolution-title" className="font-semibold text-ink">Évolution des ventes</h2>
              <p className="mt-1 text-xs text-ink-soft">Montants validés par jour et par produit</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-ink-soft">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-ink" aria-hidden="true" /> VPN</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 border border-line bg-brand" aria-hidden="true" /> Auto-Setup</span>
            </div>
          </div>
          {report.kpis.approvedCount > 0 ? (
            <DailySalesChart report={report} />
          ) : (
            <div className="mt-5 flex h-56 flex-col items-center justify-center border border-dashed border-line bg-clay text-center">
              <BarChart3 className="h-8 w-8 text-ink-soft" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-ink">Pas encore de vente validée</p>
              <p className="mt-1 max-w-sm text-xs text-ink-soft">Les encaissements apparaîtront ici dès qu’une autorisation sera confirmée.</p>
            </div>
          )}
        </section>

        <section className="border-2 border-line bg-paper p-4" aria-labelledby="conversion-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="conversion-title" className="font-semibold text-ink">Qualité du tunnel</h2>
              <p className="mt-1 text-xs text-ink-soft">De la demande à l’activation</p>
            </div>
            <RefreshCw className="h-4 w-4 text-ink-soft" aria-hidden="true" />
          </div>
          <div className="mt-6 space-y-5">
            <div>
              <div className="flex items-center justify-between text-sm"><span className="text-ink-soft">Conversion validée</span><strong className="tabular-nums text-ink">{percentLabel(report.kpis.conversionRate)}</strong></div>
              <div className="mt-2 h-2 bg-clay"><div className="h-full bg-brand" style={{ width: `${Math.min(report.kpis.conversionRate, 100)}%` }} /></div>
              <p className="mt-1 text-xs text-ink-soft">{report.kpis.approvedCount} validée(s) sur {report.kpis.requestCount} demande(s)</p>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm"><span className="text-ink-soft">Activation réalisée</span><strong className="tabular-nums text-ink">{percentLabel(report.kpis.activationRate)}</strong></div>
              <div className="mt-2 h-2 bg-clay"><div className="h-full bg-ok" style={{ width: `${Math.min(report.kpis.activationRate, 100)}%` }} /></div>
              <p className="mt-1 text-xs text-ink-soft">{report.kpis.consumedCount} accès utilisés sur {report.kpis.approvedCount} paiement(s)</p>
            </div>
          </div>
          <div className="mt-6 border-t border-line-soft pt-4 text-xs text-ink-soft">
            <div className="flex items-center justify-between"><span>Demandes suivies</span><strong className="tabular-nums text-ink">{report.kpis.requestCount}</strong></div>
            <div className="mt-2 flex items-center justify-between"><span>Panier moyen validé</span><strong className="tabular-nums text-ink">{formatFcfa(report.kpis.approvedCount ? Math.round(report.kpis.totalAmountFcfa / report.kpis.approvedCount) : 0)}</strong></div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border-2 border-line bg-paper p-4" aria-labelledby="payment-title">
          <div className="flex items-center justify-between gap-3"><div><h2 id="payment-title" className="font-semibold text-ink">Moyens de paiement</h2><p className="mt-1 text-xs text-ink-soft">Répartition du chiffre d’affaires validé</p></div><WalletCards className="h-4 w-4 text-ink-soft" aria-hidden="true" /></div>
          <div className="mt-5 space-y-4">
            {report.paymentMethods.length === 0 ? <p className="text-sm text-ink-soft">Aucun paiement validé.</p> : report.paymentMethods.map((item) => (
              <div key={item.method}>
                <div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium text-ink">{paymentMethodLabel(item.method)}</span><span className="tabular-nums text-ink-soft">{formatFcfa(item.amountFcfa)} · {item.count}</span></div>
                <div className="mt-1.5 h-1.5 bg-clay"><div className="h-full bg-ink" style={{ width: `${(item.amountFcfa / maxMethodAmount) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
        <section className="border-2 border-line bg-paper p-4" aria-labelledby="service-title">
          <div className="flex items-center justify-between gap-3"><div><h2 id="service-title" className="font-semibold text-ink">VPN les plus demandés</h2><p className="mt-1 text-xs text-ink-soft">Services activés sur la période</p></div><KeyRound className="h-4 w-4 text-ink-soft" aria-hidden="true" /></div>
          <div className="mt-5 space-y-4">
            {report.services.length === 0 ? <p className="text-sm text-ink-soft">Aucun VPN validé.</p> : report.services.map((item) => (
              <div key={item.service}>
                <div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium text-ink">{serviceLabel(item.service)}</span><span className="tabular-nums text-ink-soft">{formatFcfa(item.amountFcfa)} · {item.count}</span></div>
                <div className="mt-1.5 h-1.5 bg-clay"><div className="h-full bg-brand" style={{ width: `${(item.amountFcfa / maxServiceAmount) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="overflow-hidden border-2 border-line bg-paper" aria-labelledby="recent-sales-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-4 py-4">
          <div><h2 id="recent-sales-title" className="font-semibold text-ink">Journal des ventes</h2><p className="mt-1 text-xs text-ink-soft">Les demandes VPN et Auto-Setup de {rangeLabel}</p></div>
          <div className="flex items-center gap-3 text-xs text-ink-soft"><span>{rows.length} ligne(s)</span>{rows.length > 8 && <button type="button" onClick={() => setShowAll((value) => !value)} className="font-semibold text-brand-deep hover:underline">{showAll ? "Réduire" : "Tout afficher"}</button>}</div>
        </div>
        {recentRows.length === 0 ? <div className="px-6 py-12 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-ok" aria-hidden="true" /><p className="mt-3 font-semibold text-ink">Aucune demande sur cette période</p><p className="mt-1 text-sm text-ink-soft">Changez la période ou revenez après une nouvelle vente.</p></div> : (
          <div className="table-mobile-wrapper"><table className="w-full text-left text-sm"><thead className="border-b border-line-soft bg-clay text-ink-soft"><tr><th className="px-4 py-3 font-medium">Produit</th><th className="px-4 py-3 font-medium">Demandeur / organisation</th><th className="px-4 py-3 font-medium">Montant</th><th className="px-4 py-3 font-medium">État</th><th className="px-4 py-3 font-medium">Date</th></tr></thead><tbody className="divide-y divide-line-soft">{recentRows.map((row) => <tr key={row.id} className="hover:bg-clay/40"><td className="px-4 py-3"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${row.kind === "vpn" ? "bg-ink" : "bg-brand"}`} aria-hidden="true" /><div><p className="font-semibold text-ink">{row.kind === "vpn" ? "VPN" : "Auto-Setup"}</p><p className="text-xs text-ink-soft">{row.kind === "vpn" && row.service ? `${serviceLabel(row.service)} · ${row.billingPeriod ? periodLabel(row.billingPeriod) : ""}` : "Configuration MikroTik"}</p></div></div></td><td className="px-4 py-3"><p className="font-medium text-ink">{row.requesterName}</p><p className="max-w-[230px] truncate text-xs text-ink-soft">{row.orgName} · {row.requesterEmail}</p></td><td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-ink">{formatFcfa(row.amountFcfa)}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${row.status === "approved" ? "bg-green-100 text-green-800" : row.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>{row.status === "approved" ? "Validée" : row.status === "pending" ? "En attente" : "Refusée"}</span></td><td className="whitespace-nowrap px-4 py-3 text-xs text-ink-soft">{formatDate(row.createdAt)}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </div>
  );
}
