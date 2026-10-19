"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  ChevronDown,
  Download,
  Gift,
  RotateCcw,
  Search,
  ChevronLeft,
  Wifi,
} from "lucide-react";
import UserDrawer from "./UserDrawer";
import type { QuotaRouter } from "./VpnQuotaForm";
import { roleLabel } from "@/lib/auth/roles";
import UsersDirectoryRow from "./UsersDirectoryRow";
import { userDirectoryPage } from "./users-directory-page";
import TemporaryAccessPasses, {
  type Grant,
  type GrantRouter,
  type Organization,
} from "../remote-access/TemporaryAccessPasses";
import {
  buildUsersCsv,
  filterUsers,
  type UserControlFilter,
  type UserControlRow,
} from "./users-control-center";
import { OrganizationFocusPanel } from "./OrganizationFocusPanel";
import { UsersDirectoryIndex } from "./UsersDirectoryIndex";
import { UsersRegisterPriority } from "./UsersRegisterPriority";
import type { OrganizationFocus } from "./organization-focus";
import { buildUsersRegisterSummary } from "./users-register";

const FILTERS: Array<{ value: UserControlFilter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "free", label: "Quota gratuit" },
  { value: "paid", label: "VPN payant" },
  { value: "expiring", label: "Expire bientôt" },
];

export default function UsersControlCenter({
  rows,
  superadmin,
  routersByOrg,
  temporaryAccess,
  organizationFocus,
}: {
  rows: UserControlRow[];
  superadmin: boolean;
  /* Routeurs par organisation : le tiroir doit pouvoir viser UNE zone. */
  routersByOrg: Record<string, QuotaRouter[]>;
  temporaryAccess: {
    organizations: Organization[];
    routers: GrantRouter[];
    grants: Grant[];
  } | null;
  organizationFocus: OrganizationFocus | null;
}) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [copyError, setCopyError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<UserControlFilter>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);
  const filteredRows = useMemo(
    () =>
      filterUsers(rows, query, activeFilter, now).filter(
        (row) => roleFilter === "all" || row.role === roleFilter,
      ),
    [activeFilter, now, query, rows, roleFilter],
  );
  const summary = useMemo(
    () => buildUsersRegisterSummary(rows, now),
    [now, rows],
  );
  const filterCounts = useMemo(
    () =>
      Object.fromEntries(
        (
          ["all", "admins", "superadmins", "free", "paid", "expiring"] as const
        ).map((value) => [
          value,
          filterUsers(rows, query, value, now).filter(
            (row) => roleFilter === "all" || row.role === roleFilter,
          ).length,
        ]),
      ) as Record<UserControlFilter, number>,
    [now, rows, query, roleFilter],
  );

  const roleOptions = useMemo(
    () =>
      [...new Set(rows.map((row) => row.role))].map((value) => ({
        value,
        label: roleLabel(value),
      })),
    [rows],
  );
  const pageKey = `${query}|${activeFilter}|${roleFilter}`;
  const [pageState, setPageState] = useState({ key: pageKey, page: 0 });
  const paged = userDirectoryPage(
    filteredRows,
    pageState.key === pageKey ? pageState.page : 0,
  );
  const setPage = (page: number) => setPageState({ key: pageKey, page });

  function exportCsv() {
    const blob = new Blob([buildUsersCsv(filteredRows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `safelinkhub-utilisateurs-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyEmail(row: UserControlRow) {
    try {
      await navigator.clipboard.writeText(row.email);
      setCopyError(null);
      setCopiedId(row.id);
      window.setTimeout(
        () => setCopiedId((current) => (current === row.id ? null : current)),
        1600,
      );
    } catch {
      setCopyError(
        "Copie impossible. Sélectionnez l’e-mail dans la fiche pour le copier manuellement.",
      );
    }
  }

  const closeDrawer = useCallback(() => setOpenRowId(null), []);

  const openRow = openRowId
    ? (rows.find((row) => row.id === openRowId) ?? null)
    : null;

  function resetFilters() {
    setQuery("");
    setActiveFilter("all");
    setRoleFilter("all");
  }

  return (
    <div className="animate-fade-in-up min-w-0 space-y-5 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-72">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">
            Annuaire
          </p>
          <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight text-ink">
            {organizationFocus
              ? `Utilisateurs de ${organizationFocus.name}`
              : "Utilisateurs"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
            {organizationFocus
              ? `Consultez les membres de ${organizationFocus.name} et ouvrez leur fiche pour gérer leurs accès.`
              : superadmin
                ? "Retrouvez une personne, son organisation et ses accès depuis un seul annuaire."
                : "Retrouvez les membres de votre équipe et consultez leurs informations."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={superadmin ? "/admin/vpn-access" : "/admin/remote-access"}
            className="btn btn-md btn-outline"
          >
            <Wifi aria-hidden="true" className="h-4 w-4" />
            Accès VPN
          </Link>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!filteredRows.length}
            className="btn btn-md btn-outline"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            Exporter la liste
          </button>
        </div>
      </header>

      <UsersRegisterPriority
        focusedOrganization={organizationFocus}
        summary={summary}
      />

      {organizationFocus && (
        <OrganizationFocusPanel focus={organizationFocus} compact />
      )}

      <UsersDirectoryIndex
        query={query}
        activeFilter={activeFilter}
        resultCount={filteredRows.length}
        filterCounts={filterCounts}
        filters={FILTERS}
        onQueryChange={setQuery}
        onFilterChange={setActiveFilter}
        onReset={resetFilters}
        roleFilter={roleFilter}
        roleOptions={roleOptions}
        onRoleChange={setRoleFilter}
      />

      {filteredRows.length === 0 ? (
        <div className="border border-dashed border-line bg-paper px-6 py-14 text-center">
          <Search
            className="mx-auto h-8 w-8 text-ink-soft"
            aria-hidden="true"
          />
          <p className="mt-3 font-semibold text-ink">
            Aucun utilisateur trouvé
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Modifiez la recherche ou réinitialisez les filtres.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="btn btn-md btn-outline mt-4 inline-flex items-center gap-2"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Effacer les
            filtres
          </button>
        </div>
      ) : (
        <>
          <section
            className="overflow-hidden rounded-2xl border border-line bg-paper"
            aria-label="Annuaire des utilisateurs"
          >
            <div
              aria-hidden="true"
              className={`hidden items-center gap-x-4 border-b border-line bg-clay/60 px-5 py-3 text-xs font-medium text-ink-soft lg:grid ${superadmin ? "lg:grid-cols-[2.25rem_minmax(0,1.3fr)_minmax(0,1fr)_7rem_minmax(0,1fr)_1.25rem]" : "lg:grid-cols-[2.25rem_minmax(0,1fr)_9rem_1.25rem]"}`}
            >
              <span />
              <span>Utilisateur</span>
              {superadmin && <span>Organisation</span>}
              <span>Rôle</span>
              {superadmin && <span>Accès VPN</span>}
              <span />
            </div>
            <ul
              role="list"
              aria-label={
                organizationFocus
                  ? `Utilisateurs de ${organizationFocus.name} correspondant aux filtres actifs`
                  : "Utilisateurs correspondant aux filtres actifs"
              }
              className="divide-y divide-line-soft"
            >
              {paged.rows.map((row) => (
                <UsersDirectoryRow
                  key={row.id}
                  row={row}
                  superadmin={superadmin}
                  now={now}
                  onOpen={() => {
                    setCopyError(null);
                    setOpenRowId(row.id);
                  }}
                />
              ))}
            </ul>
          </section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-soft">
              {paged.start}–{paged.end} sur {filteredRows.length} utilisateur
              {filteredRows.length > 1 ? "s" : ""} · ouvrez une fiche pour agir.
            </p>
            {paged.pageCount > 1 && (
              <nav
                aria-label="Pagination des utilisateurs"
                className="flex items-center gap-2"
              >
                <button
                  type="button"
                  disabled={paged.page === 0}
                  onClick={() => setPage(paged.page - 1)}
                  className="btn btn-sm btn-outline"
                >
                  <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                  Précédent
                </button>
                <span className="text-xs tabular-nums text-ink-soft">
                  {paged.page + 1} / {paged.pageCount}
                </span>
                <button
                  type="button"
                  disabled={paged.page === paged.pageCount - 1}
                  onClick={() => setPage(paged.page + 1)}
                  className="btn btn-sm btn-outline"
                >
                  Suivant
                </button>
              </nav>
            )}
          </div>
        </>
      )}

      {/* Un seul tiroir à la fois : c'est ce qui permet à la liste de rester
          une liste. */}
      {openRow && (
        <UserDrawer
          row={openRow}
          superadmin={superadmin}
          routers={routersByOrg[openRow.orgId] ?? []}
          copied={copiedId === openRow.id}
          copyError={copyError}
          onCopyEmail={() => copyEmail(openRow)}
          onClose={closeDrawer}
        />
      )}

      {superadmin && !organizationFocus && temporaryAccess && (
        <details className="group overflow-hidden rounded-2xl border border-line bg-paper">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-clay/55 marker:hidden md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-brand/20 text-brand-deep">
                <Gift className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold uppercase tracking-[0.16em] text-brand-deep">
                  Superadmin · gratuit
                </span>
                <span className="mt-1 block truncate font-semibold text-ink">
                  Passes d’accès temporaire
                </span>
                <span className="mt-0.5 block truncate text-xs text-ink-soft">
                  Promo, parrainage, récompense ou intervention MikroTik
                </span>
              </span>
            </div>
            <span className="flex shrink-0 items-center gap-3 text-xs text-ink-soft">
              <span className="hidden sm:inline">
                {temporaryAccess.grants.length} récent
                {temporaryAccess.grants.length > 1 ? "s" : ""}
              </span>
              <ChevronDown
                className="h-4 w-4 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
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
