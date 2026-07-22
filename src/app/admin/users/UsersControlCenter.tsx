"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  Check,
  CircleDollarSign,
  Clock3,
  Copy,
  Download,
  Mail,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wifi,
} from "lucide-react";
import VpnQuotaForm from "./VpnQuotaForm";
import TemporaryAccessPasses, {
  type Grant,
  type GrantRouter,
  type Organization,
} from "../remote-access/TemporaryAccessPasses";
import { buildUsersCsv, filterUsers, type UserControlFilter, type UserControlRow } from "./users-control-center";

const FILTERS: Array<{ value: UserControlFilter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "admins", label: "Admins" },
  { value: "superadmins", label: "Superadmins" },
  { value: "free", label: "Quota gratuit" },
  { value: "paid", label: "VPN payant" },
  { value: "expiring", label: "Expire bientôt" },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function roleLabel(role: string) {
  return role === "superadmin" ? "Superadmin" : role === "admin" ? "Admin" : role;
}

function quotaTone(category: UserControlRow["quotaCategory"]) {
  if (category === "paid") return "bg-yellow-50 text-yellow-800";
  if (category === "free" || category === "unlimited") return "bg-green-50 text-ok";
  return "bg-clay text-ink-soft";
}

export default function UsersControlCenter({
  rows,
  superadmin,
  temporaryAccess,
}: {
  rows: UserControlRow[];
  superadmin: boolean;
  temporaryAccess: {
    organizations: Organization[];
    routers: GrantRouter[];
    grants: Grant[];
  } | null;
}) {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<UserControlFilter>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);
  const filteredRows = useMemo(
    () => filterUsers(rows, query, activeFilter, now),
    [activeFilter, now, query, rows],
  );
  const expiringRows = useMemo(() => filterUsers(rows, "", "expiring", now), [now, rows]);
  const organizationCount = new Set(rows.map((row) => row.orgName)).size;
  const freeCount = rows.filter((row) => row.quotaCategory === "free" || row.quotaCategory === "unlimited").length;
  const paidCount = rows.filter((row) => row.quotaCategory === "paid").length;

  function exportCsv() {
    const blob = new Blob([buildUsersCsv(filteredRows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `safelinkhub-utilisateurs-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyEmail(row: UserControlRow) {
    await navigator.clipboard.writeText(row.email);
    setCopiedId(row.id);
    window.setTimeout(() => setCopiedId((current) => (current === row.id ? null : current)), 1600);
  }

  function resetFilters() {
    setQuery("");
    setActiveFilter("all");
  }

  function rowActions(row: UserControlRow) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => copyEmail(row)}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-clay hover:text-ink"
          title="Copier l’adresse email"
        >
          {copiedId === row.id ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
          {copiedId === row.id ? "Copié" : "Email"}
        </button>
        {superadmin && (
          <Link
            href="/admin/vpn-access"
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-clay hover:text-ink"
          >
            <Wifi className="h-3.5 w-3.5" /> VPN
          </Link>
        )}
        <Link
          href="/admin/remote-access"
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-clay hover:text-ink"
        >
          <ArrowUpRight className="h-3.5 w-3.5" /> Accès distant
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-ok">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Station de contrôle
          </div>
          <h1 className="text-2xl font-bold text-ink">Utilisateurs</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            {superadmin
              ? "Retrouvez les comptes, leurs organisations et le quota VPN en un coup d’œil."
              : "Membres de l’équipe ayant accès à cette organisation SafeLinkHub."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={filteredRows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-[#3A362F] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" /> Exporter CSV
          </button>
          <Link
            href={superadmin ? "/admin/vpn-access" : "/admin/remote-access"}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm font-semibold text-ink hover:bg-clay"
          >
            <Wifi className="h-4 w-4" aria-hidden="true" /> Accès VPN
          </Link>
        </div>
      </div>

      {superadmin && temporaryAccess && (
        <TemporaryAccessPasses
          organizations={temporaryAccess.organizations}
          routers={temporaryAccess.routers}
          grants={temporaryAccess.grants}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Utilisateurs", value: rows.length, hint: "comptes visibles", icon: Users },
          { label: "Organisations", value: organizationCount, hint: "structures suivies", icon: Building2 },
          { label: "Quota gratuit", value: freeCount, hint: "accès offerts", icon: CircleDollarSign },
          { label: "À surveiller", value: expiringRows.length, hint: `${paidCount} quota(s) payant(s)`, icon: Clock3 },
        ].map(({ label, value, hint, icon: Icon }) => (
          <div key={label} className="border-2 border-line bg-paper p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{label}</p>
              <Icon className="h-4 w-4 text-ok" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-ink">{value}</p>
            <p className="mt-1 text-xs text-ink-soft">{hint}</p>
          </div>
        ))}
      </div>

      <div className="border-2 border-line bg-paper p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-line bg-[#fcfbf8] px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher par nom, email ou organisation…"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft"
              aria-label="Rechercher un utilisateur"
            />
          </label>
          <div className="flex items-center gap-2 text-xs text-ink-soft">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filtres rapides
            <span className="rounded-full bg-clay px-2 py-1 font-semibold tabular-nums text-ink">{filteredRows.length}</span>
          </div>
          <button
            type="button"
            onClick={resetFilters}
            disabled={!query && activeFilter === "all"}
            className="inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium text-ink-soft hover:bg-clay hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Réinitialiser
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {FILTERS.map((filter) => {
            const count = filterUsers(rows, "", filter.value, now).length;
            const active = activeFilter === filter.value;
            return (
              <button
                key={filter.value}
                type="button"
                onClick={() => setActiveFilter(filter.value)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink-soft hover:bg-clay hover:text-ink"
                }`}
              >
                {filter.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${active ? "bg-white/15 text-white" : "bg-clay text-ink-soft"}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div className="border-2 border-dashed border-line bg-paper px-6 py-14 text-center">
          <Search className="mx-auto h-8 w-8 text-ink-soft" aria-hidden="true" />
          <p className="mt-3 font-semibold text-ink">Aucun utilisateur trouvé</p>
          <p className="mt-1 text-sm text-ink-soft">Modifiez la recherche ou réinitialisez les filtres.</p>
          <button type="button" onClick={resetFilters} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm font-medium text-ink hover:bg-clay">
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Effacer les filtres
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {filteredRows.map((row) => (
              <div key={row.id} className="border-2 border-line bg-paper p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{row.name}</p>
                    <p className="mt-0.5 truncate text-sm text-ink-soft">{row.email}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-clay px-2 py-0.5 text-xs font-medium text-ink-soft">{roleLabel(row.role)}</span>
                </div>
                {superadmin && <p className="mt-3 truncate text-xs text-ink-soft">{row.orgName}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {superadmin && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${quotaTone(row.quotaCategory)}`}>{row.quotaLabel}</span>}
                  <span className="text-xs text-ink-soft">Inscrit le {formatDate(row.createdAt)}</span>
                </div>
                <div className="mt-3 border-t border-line-soft pt-3">{rowActions(row)}</div>
                {superadmin && <div className="mt-3 border-t border-line-soft pt-3"><p className="mb-2 text-xs font-medium text-ink-soft">Quota VPN</p><VpnQuotaForm userId={row.id} userEmail={row.email} /></div>}
              </div>
            ))}
          </div>

          <div className="hidden overflow-hidden border-2 border-line bg-paper md:block">
            <div className="table-mobile-wrapper">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line-soft bg-clay text-ink-soft">
                  <tr>
                    <th className="px-4 py-3 font-medium">Nom</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    {superadmin && <th className="px-4 py-3 font-medium">Organisation</th>}
                    <th className="px-4 py-3 font-medium">Rôle</th>
                    {superadmin && <th className="px-4 py-3 font-medium">Quota VPN</th>}
                    <th className="px-4 py-3 font-medium">Inscrit le</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="align-top hover:bg-[#fcfbf8]">
                      <td className="px-4 py-4 font-medium text-ink">{row.name}</td>
                      <td className="px-4 py-4 text-ink-soft"><span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" aria-hidden="true" />{row.email}</span></td>
                      {superadmin && <td className="px-4 py-4 text-ink-soft">{row.orgName}</td>}
                      <td className="px-4 py-4"><span className="rounded-full bg-clay px-2 py-0.5 text-xs font-medium text-ink-soft">{roleLabel(row.role)}</span></td>
                      {superadmin && <td className="min-w-64 px-4 py-4"><div className="flex flex-col gap-2"><span className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${quotaTone(row.quotaCategory)}`}>{row.quotaLabel}</span><VpnQuotaForm userId={row.id} userEmail={row.email} /></div></td>}
                      <td className="whitespace-nowrap px-4 py-4 text-ink-soft">{formatDate(row.createdAt)}</td>
                      <td className="px-4 py-4">{rowActions(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
