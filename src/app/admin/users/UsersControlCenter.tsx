"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ChevronDown,
  Download,
  Gift,
  RotateCcw,
  Search,
  ChevronRight,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import UserDrawer from "./UserDrawer";
import { expiryHint } from "./user-expiry";
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
  const [openRowId, setOpenRowId] = useState<string | null>(null);
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

  const openRow = openRowId ? (rows.find((row) => row.id === openRowId) ?? null) : null;

  function resetFilters() {
    setQuery("");
    setActiveFilter("all");
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
          {/* ANNUAIRE. Une ligne = UNE ligne. Avant, chaque utilisateur
              occupait quatre étages : sélecteur de quota, bouton « Appliquer »,
              trois boutons d'action et la même phrase d'avertissement recopiée
              à l'infini. On voyait quatre personnes par écran au lieu de vingt,
              et l'avertissement, répété, ne se lisait plus.

              Une liste sert à TROUVER, un tiroir sert à AGIR : tout ce qui agit
              est parti dans UserDrawer, pour un utilisateur à la fois. */}
          <ul
            role="list"
            /* L'intitulé de portée était porté par le <caption> de la table.
               La table a disparu, pas le besoin : un lecteur d'écran doit
               toujours savoir de QUELS utilisateurs cette liste parle. */
            aria-label={
              organizationFocus
                ? `Utilisateurs de ${organizationFocus.name} correspondant aux filtres actifs`
                : "Utilisateurs correspondant aux filtres actifs"
            }
            className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-paper"
          >
            {filteredRows.map((row) => {
              const fin = expiryHint(row.quotaExpiresAt, now);
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setOpenRowId(row.id)}
                    aria-label={`Ouvrir le détail de ${row.name}`}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-clay/60 focus-visible:bg-clay/60 focus-visible:outline-none sm:px-5"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-clay text-xs font-bold text-ink"
                    >
                      {userMonogram(row.name)}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{row.name}</span>
                      <span className="block truncate text-xs text-ink-soft">{row.email}</span>
                    </span>

                    {/* L'organisation ne pousse plus la ligne sur trois étages :
                        une seule ligne tronquée, et seulement quand l'écran est
                        assez large pour qu'elle apporte quelque chose. */}
                    {superadmin && !organizationFocus && (
                      <span className="hidden min-w-0 max-w-[12rem] shrink-0 truncate text-sm text-ink-soft lg:block">
                        {row.orgName}
                      </span>
                    )}

                    <span className="hidden shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink sm:inline-flex">
                      {roleLabel(row.role)}
                    </span>

                    {superadmin && (
                      <span className="hidden w-40 shrink-0 text-right md:block">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${quotaTone(row.quotaCategory)}`}>
                          {row.quotaLabel}
                        </span>
                        {/* Le temps qui RESTE, pas la date à recalculer. */}
                        {fin.label && (
                          <span
                            className={`mt-0.5 block text-[11px] ${
                              fin.tone === "urgent" || fin.tone === "over" ? "font-semibold text-err" : "text-ink-soft"
                            }`}
                          >
                            {fin.label}
                          </span>
                        )}
                      </span>
                    )}

                    <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-soft" />
                  </button>

                  {/* Sur téléphone, l'essentiel qui ne tient pas sur la ligne
                      passe dessous, en une seule ligne discrète. */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-3 text-[11px] text-ink-soft sm:hidden">
                    <span className="rounded-full border border-line px-2 py-0.5 font-semibold text-ink">
                      {roleLabel(row.role)}
                    </span>
                    {superadmin && <span>{row.quotaLabel}</span>}
                    {fin.label && (
                      <span className={fin.tone === "urgent" || fin.tone === "over" ? "font-semibold text-err" : ""}>
                        {fin.label}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-xs text-ink-soft">
            {filteredRows.length} utilisateur{filteredRows.length > 1 ? "s" : ""} affiché
            {filteredRows.length > 1 ? "s" : ""} · touchez une ligne pour agir.
          </p>
        </>
      )}

      {/* Un seul tiroir à la fois : c'est ce qui permet à la liste de rester
          une liste. */}
      {openRow && (
        <UserDrawer
          row={openRow}
          superadmin={superadmin}
          copied={copiedId === openRow.id}
          onCopyEmail={() => copyEmail(openRow)}
          onClose={() => setOpenRowId(null)}
        />
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
