"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Download, Search, ShieldCheck, WalletCards } from "lucide-react";
import { formatSc } from "@/lib/safecoin/pricing";
import SafecoinActions from "./SafecoinActions";

type Report = {
  rateFcfaPerSc: number;
  rechargeFeeScCents: number;
  vpnFeeScCents: number;
  autoSetupFeeScCents: number;
  settingsVersion: number;
  settingsUpdatedAt: Date | null;
  kpis: { issued: number; spent: number; fees: number; circulating: number; activeOrganizations: number };
  daily: { day: string; issued: number; spent: number; fees: number }[];
  organizations: { orgId: string; orgName: string; orgSlug: string; balanceScCents: number; issuedScCents: number; spentScCents: number }[];
  ledger: { id: string; orgId: string; amountScCents: number; entryType: string; status: string; createdAt: Date; note: string | null }[];
};

const fcfa = new Intl.NumberFormat("fr-FR");
const entryLabels: Record<string, string> = {
  topup: "Recharge",
  vpn_charge: "VPN",
  auto_setup_charge: "Auto-Setup",
  fee: "Frais",
  admin_credit: "Crédit admin",
  admin_debit: "Débit admin",
  refund: "Remboursement",
  reversal: "Correction",
};

function downloadCsv(report: Report) {
  const header = ["date", "organisation", "type", "montant_sc", "statut", "note"];
  const lines = report.ledger.map((row) => [
    new Date(row.createdAt).toISOString(),
    row.orgId,
    entryLabels[row.entryType] ?? row.entryType,
    (row.amountScCents / 100).toFixed(2),
    row.status,
    row.note ?? "",
  ]);
  const csv = [header, ...lines].map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `safecoin-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function DailyChart({ daily }: { daily: Report["daily"] }) {
  const max = Math.max(...daily.flatMap((point) => [point.issued, point.spent, point.fees]), 1);
  const width = 720;
  const height = 190;
  const slot = width / Math.max(daily.length, 1);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Émission, consommation et frais Safecoin par jour" className="mt-4 w-full">
      <line x1="0" y1="160" x2={width} y2="160" stroke="var(--line)" strokeWidth="2" />
      {daily.map((point, index) => {
        const x = index * slot + slot / 2;
        const bars = [
          { value: point.issued, color: "var(--brand)", offset: -12 },
          { value: point.spent, color: "var(--ink)", offset: 0 },
          { value: point.fees, color: "var(--warn)", offset: 12 },
        ];
        return <g key={point.day}>{bars.map((bar) => { const barHeight = (bar.value / max) * 132; return <rect key={bar.color} x={x + bar.offset - 4} y={160 - barHeight} width="8" height={barHeight} rx="2" fill={bar.color}><title>{`${point.day} · ${bar.value / 100} SC`}</title></rect>; })}{(index === 0 || index === daily.length - 1 || index % Math.max(1, Math.ceil(daily.length / 7)) === 0) && <text x={x} y="180" textAnchor="middle" fontSize="10" fill="var(--ink-soft)">{point.day.slice(5)}</text>}</g>;
      })}
    </svg>
  );
}

export default function SafecoinConsole({ report }: { report: Report }) {
  const [search, setSearch] = useState("");
  const filteredOrganizations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return report.organizations;
    return report.organizations.filter((org) => `${org.orgName} ${org.orgSlug}`.toLowerCase().includes(query));
  }, [report.organizations, search]);
  const kpis = [
    { label: "SC émis", value: formatSc(report.kpis.issued), hint: "recharges et récompenses", icon: ArrowUpRight, accent: "text-ok" },
    { label: "SC consommés", value: formatSc(report.kpis.spent), hint: "VPN + Auto-Setup", icon: ArrowDownRight, accent: "text-warn" },
    { label: "Frais", value: formatSc(report.kpis.fees), hint: "règles actives", icon: WalletCards, accent: "text-brand-deep" },
    { label: "En circulation", value: formatSc(report.kpis.circulating), hint: `${report.kpis.activeOrganizations} organisation${report.kpis.activeOrganizations > 1 ? "s" : ""} active${report.kpis.activeOrganizations > 1 ? "s" : ""}`, icon: ShieldCheck, accent: "text-ink" },
  ];

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-deep">SafeLinkHub · superadmin</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">Station de contrôle</h1><p className="mt-1 text-sm text-ink-soft">Safecoin, émission, consommation et promotions de la plateforme.</p></div>
        <div className="flex items-center gap-2"><span className="rounded-full border border-line-soft bg-paper px-3 py-1.5 text-xs font-semibold text-ink">1 SC = {fcfa.format(report.rateFcfaPerSc)} FCFA</span><button type="button" onClick={() => downloadCsv(report)} className="inline-flex items-center gap-2 bg-ink px-3 py-2 text-sm font-semibold text-white"><Download className="h-4 w-4" aria-hidden="true" /> Exporter CSV</button></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{kpis.map((kpi) => { const Icon = kpi.icon; return <div key={kpi.label} className="border border-line bg-paper p-4 shadow-[3px_3px_0_var(--line)] rounded-xl"><div className="flex items-center justify-between gap-2"><p className="text-sm text-ink-soft">{kpi.label}</p><Icon className={`h-4 w-4 ${kpi.accent}`} aria-hidden="true" /></div><p className="mt-3 text-2xl font-bold tabular-nums text-ink">{kpi.value}</p><p className="mt-1 text-xs text-ink-soft">{kpi.hint}</p></div>; })}</div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <div className="border border-line bg-paper p-5 sm:p-6 rounded-xl"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-ink">Flux Safecoin</h2><p className="mt-1 text-sm text-ink-soft">Période sélectionnée · émissions, usages et frais.</p></div><div className="flex gap-3 text-[11px] text-ink-soft"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-brand" />Émis</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-ink" />Consommés</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-warn" />Frais</span></div></div><DailyChart daily={report.daily} /></div>
        <div className="border border-line bg-[#1c1917] p-5 text-white sm:p-6"><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand">Règle active</p><p className="mt-4 text-4xl font-bold">1 SC</p><p className="mt-1 text-xl text-white/75">= {fcfa.format(report.rateFcfaPerSc)} FCFA</p><div className="mt-7 border-t border-white/15 pt-4 text-sm text-white/65"><p>Version {report.settingsVersion}</p><p className="mt-1">Les promotions et passes temporaires restent gratuits et ne débitent jamais ce compteur.</p></div></div>
      </div>

      <div className="border border-line bg-paper p-5 sm:p-6 rounded-xl"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-ink">Organisations</h2><p className="mt-1 text-sm text-ink-soft">Solde, émission et consommation par organisation.</p></div><label className="relative block w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-soft" aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une organisation" aria-label="Rechercher une organisation" className="w-full border border-line-soft bg-paper py-2 pl-9 pr-3 text-sm rounded-lg" /></label></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b border-line-soft bg-clay text-ink-soft"><tr><th className="px-3 py-2 font-medium">Organisation</th><th className="px-3 py-2 font-medium">Solde</th><th className="px-3 py-2 font-medium">SC émis</th><th className="px-3 py-2 font-medium">SC consommés</th><th className="px-3 py-2 font-medium">État</th></tr></thead><tbody className="divide-y divide-line-soft">{filteredOrganizations.map((org) => <tr key={org.orgId}><td className="px-3 py-3"><p className="font-semibold text-ink">{org.orgName}</p><p className="text-xs text-ink-soft">{org.orgSlug}</p></td><td className="px-3 py-3 font-semibold text-ink">{formatSc(org.balanceScCents)}</td><td className="px-3 py-3 text-ok">{formatSc(org.issuedScCents)}</td><td className="px-3 py-3 text-warn">{formatSc(org.spentScCents)}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${org.balanceScCents > 0 ? "bg-green-50 text-ok" : "bg-clay text-ink-soft"}`}>{org.balanceScCents > 0 ? "Actif" : "Épuisé"}</span></td></tr>)}{filteredOrganizations.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-ink-soft">Aucune organisation trouvée.</td></tr>}</tbody></table></div></div>

      <SafecoinActions rateFcfaPerSc={report.rateFcfaPerSc} rechargeFeeScCents={report.rechargeFeeScCents} vpnFeeScCents={report.vpnFeeScCents} autoSetupFeeScCents={report.autoSetupFeeScCents} />

      <div className="border border-line bg-paper p-5 sm:p-6 rounded-xl"><h2 className="font-semibold text-ink">Dernières opérations</h2><div className="mt-4 space-y-2">{report.ledger.slice(0, 12).map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 border border-line-soft px-3 py-2.5 text-sm"><div><span className="font-semibold text-ink">{entryLabels[row.entryType] ?? row.entryType}</span><span className="ml-2 text-xs text-ink-soft">{new Date(row.createdAt).toLocaleString("fr-FR")}</span>{row.note && <p className="mt-0.5 text-xs text-ink-soft">{row.note}</p>}</div><span className={`font-semibold ${row.amountScCents >= 0 ? "text-ok" : "text-warn"}`}>{row.amountScCents >= 0 ? "+" : "−"}{formatSc(Math.abs(row.amountScCents))}</span></div>)}{report.ledger.length === 0 && <p className="border border-dashed border-line-soft px-3 py-8 text-center text-sm text-ink-soft">Aucune opération sur cette période.</p>}</div></div>
    </div>
  );
}
