"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  ChevronDown,
  Download,
  Gift,
  Mail,
  RotateCcw,
  Search,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import VpnQuotaForm from "./VpnQuotaForm";
import TemporaryAccessPasses, {
  type Grant,
  type GrantRouter,
  type Organization,
} from "../remote-access/TemporaryAccessPasses";
import { buildUsersCsv, filterUsers, type UserControlFilter, type UserControlRow } from "./users-control-center";
import { OrganizationFocusPanel } from "./OrganizationFocusPanel";
import { UsersDirectoryIndex } from "./UsersDirectoryIndex";
import { UsersRegisterPriority } from "./UsersRegisterPriority";
import type { OrganizationFocus } from "./organization-focus";
import { buildUsersRegisterSummary, userMonogram } from "./users-register";

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
  if (category === "paid") return "border-warn bg-warn/10 text-ink";
  if (category === "free" || category === "unlimited") return "border-ok bg-ok/10 text-ink";
  return "border-line bg-clay text-ink-soft";
}

export default function UsersControlCenter({
  rows,
  superadmin,
  temporaryAccess,
  organizationFocus,
}: {
  rows: UserControlRow[];
  superadmin: boolean;
  temporaryAccess: {
    organizations: Organization[];
    routers: GrantRouter[];
    grants: Grant[];
  } | null;
  organizationFocus: OrganizationFocus | null;
}) {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<UserControlFilter>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);
  const filteredRows = useMemo(
    () => filterUsers(rows, query, activeFilter, now),
    [activeFilter, now, query, rows],
  );
  const summary = useMemo(() => buildUsersRegisterSummary(rows, now), [now, rows]);
  const filterCounts = useMemo(
    () => Object.fromEntries(FILTERS.map(({ value }) => [value, filterUsers(rows, "", value, now).length])) as Record<UserControlFilter, number>,
    [now, rows],
  );

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
    <div className="animate-fade-in-up space-y-8">
      <section className="border border-line bg-paper p-5 sm:p-6 rounded-xl">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-ok">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Station de contrôle
            </div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
              {organizationFocus ? `Utilisateurs de ${organizationFocus.name}` : "Utilisateurs"}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">
              {organizationFocus
                ? `Les membres visibles de ${organizationFocus.name}, avec l’état de ses routeurs.`
                : superadmin
                ? "Une vue calme pour comprendre les comptes, les organisations et les accès VPN qui méritent votre attention."
                : "Les membres de l’équipe qui ont accès à cette organisation SafeLinkHub."}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href={superadmin ? "/admin/vpn-access" : "/admin/remote-access"}
              className="inline-flex items-center gap-2 border border-line bg-paper px-3.5 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-clay rounded-xl"
            >
              <Wifi className="h-4 w-4" aria-hidden="true" /> Accès VPN
            </Link>
            <button
              type="button"
              onClick={exportCsv}
              disabled={filteredRows.length === 0}
              className="inline-flex items-center gap-2 border border-line bg-brand px-3.5 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Exporter la liste
            </button>
          </div>
        </div>
      </section>

      <UsersRegisterPriority focusedOrganization={organizationFocus} summary={summary} />

      {organizationFocus && <OrganizationFocusPanel focus={organizationFocus} compact />}

      <UsersDirectoryIndex
        query={query}
        activeFilter={activeFilter}
        resultCount={filteredRows.length}
        filterCounts={filterCounts}
        filters={FILTERS}
        onQueryChange={setQuery}
        onFilterChange={setActiveFilter}
        onReset={resetFilters}
      />

      {filteredRows.length === 0 ? (
        <div className="border border-dashed border-line bg-paper px-6 py-14 text-center">
          <Search className="mx-auto h-8 w-8 text-ink-soft" aria-hidden="true" />
          <p className="mt-3 font-semibold text-ink">Aucun utilisateur trouvé</p>
          <p className="mt-1 text-sm text-ink-soft">Modifiez la recherche ou réinitialisez les filtres.</p>
          <button type="button" onClick={resetFilters} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm font-medium text-ink hover:bg-clay">
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Effacer les filtres
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-4 md:hidden">
            {filteredRows.map((row) => (
              <div key={row.id} className="border border-line-soft bg-paper p-5 rounded-xl">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-line bg-clay text-xs font-bold text-ink" aria-hidden="true">
                      {userMonogram(row.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{row.name}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-ink-soft">
                        <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {row.email}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 border border-line px-2 py-1 text-xs font-semibold text-ink">{roleLabel(row.role)}</span>
                </div>
                {superadmin && !organizationFocus && <p className="mt-3 truncate text-xs text-ink-soft">{row.orgName}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {superadmin && <span className={`inline-flex border px-2 py-1 text-xs font-semibold ${quotaTone(row.quotaCategory)}`}>{row.quotaLabel}</span>}
                  <span className="text-xs text-ink-soft">Inscrit le {formatDate(row.createdAt)}</span>
                </div>
                <div className="mt-3 border-t border-line-soft pt-3">{rowActions(row)}</div>
                {superadmin && <div className="mt-3 border-t border-line-soft pt-3"><p className="mb-2 text-xs font-medium text-ink-soft">Quota VPN</p><VpnQuotaForm userId={row.id} userEmail={row.email} /></div>}
              </div>
            ))}
          </div>

          <div className="hidden overflow-hidden border border-line-soft bg-paper md:block">
            <div className="table-mobile-wrapper">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  {organizationFocus
                    ? `Utilisateurs de ${organizationFocus.name} correspondant aux filtres actifs`
                    : "Utilisateurs correspondant aux filtres actifs"}
                </caption>
                <thead className="border-b border-line-soft bg-clay/70 text-ink-soft">
                  <tr>
                    <th className="px-4 py-3 font-medium">Personne</th>
                    {superadmin && !organizationFocus && <th className="px-4 py-3 font-medium">Organisation</th>}
                    <th className="px-4 py-3 font-medium">Rôle</th>
                    {superadmin && <th className="px-4 py-3 font-medium">Quota VPN</th>}
                    <th className="px-4 py-3 font-medium">Inscrit le</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="align-top transition-colors hover:bg-clay/35">
                      <td className="px-5 py-5">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-line bg-clay text-xs font-bold text-ink" aria-hidden="true">
                            {userMonogram(row.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink">{row.name}</p>
                            <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-ink-soft">
                              <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {row.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      {superadmin && !organizationFocus && <td className="px-5 py-5 text-ink-soft">{row.orgName}</td>}
                      <td className="px-5 py-5"><span className="inline-flex border border-line px-2 py-1 text-xs font-semibold text-ink">{roleLabel(row.role)}</span></td>
                      {superadmin && <td className="min-w-64 px-5 py-5"><div className="flex flex-col gap-2"><span className={`inline-flex w-fit border px-2 py-1 text-xs font-semibold ${quotaTone(row.quotaCategory)}`}>{row.quotaLabel}</span><VpnQuotaForm userId={row.id} userEmail={row.email} /></div></td>}
                      <td className="whitespace-nowrap px-5 py-5 text-ink-soft">{formatDate(row.createdAt)}</td>
                      <td className="px-5 py-5">{rowActions(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {superadmin && !organizationFocus && temporaryAccess && (
        <details className="group overflow-hidden border border-line bg-paper">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-clay/55 marker:hidden md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-brand/20 text-brand-deep">
                <Gift className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-brand-deep">Superadmin · gratuit</span>
                <span className="mt-1 block truncate font-semibold text-ink">Passes d’accès temporaire</span>
                <span className="mt-0.5 block truncate text-xs text-ink-soft">Promo, parrainage, récompense ou intervention MikroTik</span>
              </span>
            </div>
            <span className="flex shrink-0 items-center gap-3 text-xs text-ink-soft">
              <span className="hidden sm:inline">{temporaryAccess.grants.length} récent{temporaryAccess.grants.length > 1 ? "s" : ""}</span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
            </span>
          </summary>
          <div className="border-t border-line-soft bg-clay/20 p-3 md:p-4">
            <TemporaryAccessPasses
              embedded
              organizations={temporaryAccess.organizations}
              routers={temporaryAccess.routers}
              grants={temporaryAccess.grants}
            />
          </div>
        </details>
      )}
    </div>
  );
}
