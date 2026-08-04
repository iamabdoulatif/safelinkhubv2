# Users Register Operational Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** turn `/admin/users` into a coherent SafeLinkHub operational register that foregrounds actionable access work while preserving every current permission, filter, export, and organization-focus behavior.

**Architecture:** leave authorization and data loading in `page.tsx`. Derive presentation counts from the already-authorized `UserControlRow[]` in a pure module. Keep the search, filters, copy action, and CSV export in `UsersControlCenter`, while extracting the priority strip and the controlled register index. The existing organization view remains server-filtered and is restyled as a compact contextual band.

**Tech Stack:** Next.js 16 App Router, React client components, TypeScript, Tailwind design tokens already in the repository, Lucide, Node test runner through `tsx` and `react-dom/server`.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/app/admin/users/users-register.ts` | Pure visible-row summary and deterministic monogram helpers. |
| `src/app/admin/users/users-register.test.ts` | Unit regression tests for counts, expiry boundary, and initials. |
| `src/app/admin/users/UsersRegisterPriority.tsx` | Border-based priority strip with global and organization-focused labels. |
| `src/app/admin/users/UsersDirectoryIndex.tsx` | Controlled search/filter/result control surface. |
| `src/app/admin/users/UsersRegisterPresentation.test.tsx` | Server-render regression checks for hierarchy, labels, and page order. |
| `src/app/admin/users/UsersControlCenter.tsx` | Composition, existing actions, responsive directory, and temporary passes. |
| `src/app/admin/users/OrganizationFocusPanel.tsx` | Compact organization context band with unchanged navigation/data. |
| `src/app/admin/users/OrganizationFocusPanel.test.tsx` | Existing organization-focus coverage plus compact-mode regression coverage. |

### Task 1: Add a pure register presentation model

**Files:**
- Create: `src/app/admin/users/users-register.ts`
- Create: `src/app/admin/users/users-register.test.ts`

- [ ] **Step 1: Write failing tests for visible-row counts, the expiry boundary, and initials.**

  ```ts
  import assert from "node:assert/strict";
  import { test } from "node:test";
  import { buildUsersRegisterSummary, userMonogram } from "./users-register";

  test("résume les seules lignes visibles du registre", () => {
    const summary = buildUsersRegisterSummary([
      { orgName: "Alpha", quotaCategory: "free", quotaExpiresAt: "2026-08-10T00:00:00.000Z" },
      { orgName: "Alpha", quotaCategory: "unlimited", quotaExpiresAt: null },
      { orgName: "Bêta", quotaCategory: "paid", quotaExpiresAt: null },
    ], new Date("2026-08-04T00:00:00.000Z"));

    assert.deepEqual(summary, { attentionCount: 1, freeCount: 2, paidCount: 1, organizationCount: 2 });
  });

  test("ignore une échéance déjà passée et produit un monogramme stable", () => {
    const summary = buildUsersRegisterSummary([
      { orgName: "Alpha", quotaCategory: "free", quotaExpiresAt: "2026-08-03T23:59:59.000Z" },
    ], new Date("2026-08-04T00:00:00.000Z"));

    assert.equal(summary.attentionCount, 0);
    assert.equal(userMonogram("Awa Traoré"), "AT");
    assert.equal(userMonogram("  Diallo  "), "DI");
  });
  ```

- [ ] **Step 2: Verify RED.**

  Run:

  ```bash
  npx tsx --test src/app/admin/users/users-register.test.ts
  ```

  Expected: FAIL because `./users-register` does not exist.

- [ ] **Step 3: Implement only the shared, pure calculations.**

  ```ts
  import type { UserControlRow } from "./users-control-center";

  type UsersRegisterRow = Pick<UserControlRow, "orgName" | "quotaCategory" | "quotaExpiresAt">;

  export type UsersRegisterSummary = {
    attentionCount: number;
    freeCount: number;
    paidCount: number;
    organizationCount: number;
  };

  function expiresWithinThirtyDays(quotaExpiresAt: string | null, now: Date) {
    if (!quotaExpiresAt) return false;
    const expiresAt = new Date(quotaExpiresAt).getTime();
    const expiresBefore = now.getTime() + 30 * 24 * 60 * 60 * 1000;
    return expiresAt > now.getTime() && expiresAt <= expiresBefore;
  }

  export function buildUsersRegisterSummary(rows: UsersRegisterRow[], now: Date): UsersRegisterSummary {
    return {
      attentionCount: rows.filter((row) => expiresWithinThirtyDays(row.quotaExpiresAt, now)).length,
      freeCount: rows.filter((row) => row.quotaCategory === "free" || row.quotaCategory === "unlimited").length,
      paidCount: rows.filter((row) => row.quotaCategory === "paid").length,
      organizationCount: new Set(rows.map((row) => row.orgName)).size,
    };
  }

  export function userMonogram(name: string) {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "—";
    if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase("fr-FR");
    return `${words[0][0]}${words.at(-1)?.[0] ?? ""}`.toLocaleUpperCase("fr-FR");
  }
  ```

  The `import type` is erased at runtime, so the pure helper cannot create a runtime cycle with `users-control-center.ts`.

- [ ] **Step 4: Verify GREEN and the existing filter/CSV model.**

  Run:

  ```bash
  npx tsx --test src/app/admin/users/users-register.test.ts src/app/admin/users/users-control-center.test.ts
  ```

  Expected: all summary, filter, CSV, and monogram tests pass.

- [ ] **Step 5: Commit the tested presentation model.**

  ```bash
  git add src/app/admin/users/users-register.ts src/app/admin/users/users-register.test.ts
  git commit -m "feat: add users register summary model"
  ```

### Task 2: Compact the focused organization context before consuming it

**Files:**
- Modify: `src/app/admin/users/OrganizationFocusPanel.tsx`
- Modify: `src/app/admin/users/OrganizationFocusPanel.test.tsx`

- [ ] **Step 1: Write the failing compact-band assertion.**

  ```tsx
  test("rend le contexte ciblé comme une bande compacte avec ses parcours", () => {
    const markup = renderToStaticMarkup(<OrganizationFocusPanel compact focus={focus} />);

    assert.match(markup, /Organisation ciblée/);
    assert.match(markup, /Vue limitée aux utilisateurs et routeurs de cette organisation/);
    assert.match(markup, /Retour aux parcs clients/);
    assert.match(markup, /Voir la table technique/);
    assert.match(markup, /Routeurs de l’organisation/);
  });
  ```

- [ ] **Step 2: Verify RED.**

  Run:

  ```bash
  npx tsx --test src/app/admin/users/OrganizationFocusPanel.test.tsx
  ```

  Expected: FAIL because `compact` is not an accepted prop.

- [ ] **Step 3: Add a compact mode without changing focus data or navigation.**

  ```tsx
  type OrganizationFocusPanelProps = {
    focus: OrganizationFocus;
    compact?: boolean;
  };

  export function OrganizationFocusPanel({ focus, compact = false }: OrganizationFocusPanelProps) {
    const sectionClassName = compact
      ? "border-2 border-line bg-brand/10 p-4 md:p-5"
      : "border-2 border-line bg-paper p-5 md:p-6";
    const statsClassName = compact
      ? "mt-4 grid gap-3 border-y border-line py-3 sm:grid-cols-2 xl:grid-cols-5"
      : "mt-5 grid gap-3 border-y border-line-soft py-4 sm:grid-cols-2 xl:grid-cols-5";
  }
  ```

  Apply `sectionClassName` to the existing outer `section` and `statsClassName` to the existing `dl`; change the current header gap from `gap-5` to `gap-4`. Keep the current return link, conditional technical-table link, five `dl` definitions, router list, zero-router message, status labels, and router detail links byte-for-byte otherwise. In particular, `routerTableHref === null` must still show only the return link.

- [ ] **Step 4: Verify focused, own-fleet, and zero-router behavior.**

  Run:

  ```bash
  npx tsx --test src/app/admin/users/OrganizationFocusPanel.test.tsx src/app/admin/users/organization-focus.test.ts
  ```

  Expected: PASS, including own-fleet `scope=mine`, client table links, and missing-table-link cases.

- [ ] **Step 5: Commit the focused-context refinement.**

  ```bash
  git add src/app/admin/users/OrganizationFocusPanel.tsx src/app/admin/users/OrganizationFocusPanel.test.tsx
  git commit -m "feat: compact focused organization context"
  ```

### Task 3: Build the priority strip and controlled register index

**Files:**
- Create: `src/app/admin/users/UsersRegisterPriority.tsx`
- Create: `src/app/admin/users/UsersDirectoryIndex.tsx`
- Create: `src/app/admin/users/UsersRegisterPresentation.test.tsx`

- [ ] **Step 1: Write failing server-render tests for global and focused labels.**

  ```tsx
  import assert from "node:assert/strict";
  import { test } from "node:test";
  import { renderToStaticMarkup } from "react-dom/server";
  import { UsersRegisterPriority } from "./UsersRegisterPriority";

  test("place le signal d’action avant les autres repères", () => {
    const markup = renderToStaticMarkup(
      <UsersRegisterPriority
        focusedOrganization={null}
        summary={{ attentionCount: 3, freeCount: 18, paidCount: 14, organizationCount: 17 }}
      />,
    );

    assert.match(markup, /À traiter maintenant/);
    assert.match(markup, /Quota gratuit/);
    assert.match(markup, /VPN payant/);
    assert.match(markup, /Organisations actives/);
    assert.match(markup, />3</);
  });
  ```

- [ ] **Step 2: Verify RED.**

  Run:

  ```bash
  npx tsx --test src/app/admin/users/UsersRegisterPresentation.test.tsx
  ```

  Expected: FAIL because the presentation components do not exist.

- [ ] **Step 3: Implement `UsersRegisterPriority` with rectilinear, semantic cells.**

  ```tsx
  import { Building2, CircleDollarSign, Clock3, Router, Users, Wifi } from "lucide-react";
  import type { OrganizationFocus } from "./organization-focus";
  import type { UsersRegisterSummary } from "./users-register";

  type PriorityCell = { label: string; value: string; hint: string; icon: typeof Clock3; urgent?: boolean };

  export function UsersRegisterPriority({
    focusedOrganization,
    summary,
  }: {
    focusedOrganization: OrganizationFocus | null;
    summary: UsersRegisterSummary;
  }) {
    const cells: PriorityCell[] = focusedOrganization
      ? [
          { label: "Organisation ciblée", value: focusedOrganization.name, hint: "Vue limitée aux données autorisées", icon: Building2 },
          { label: "Membres visibles", value: String(focusedOrganization.memberCount), hint: "comptes suivis", icon: Users },
          { label: "Routeurs du parc", value: String(focusedOrganization.routerCounts.total), hint: "équipements liés", icon: Router },
          { label: "À traiter", value: String(summary.attentionCount), hint: "échéance dans 30 jours", icon: Clock3, urgent: summary.attentionCount > 0 },
        ]
      : [
          { label: "À traiter maintenant", value: String(summary.attentionCount), hint: "échéance dans 30 jours", icon: Clock3, urgent: summary.attentionCount > 0 },
          { label: "Quota gratuit", value: String(summary.freeCount), hint: "accès offerts ou illimités", icon: CircleDollarSign },
          { label: "VPN payant", value: String(summary.paidCount), hint: "comptes suivis", icon: Wifi },
          { label: "Organisations actives", value: String(summary.organizationCount), hint: "structures visibles", icon: Building2 },
        ];

    return (
      <section aria-label="Repères du registre" className="grid border-2 border-line bg-paper sm:grid-cols-2 xl:grid-cols-4">
        {cells.map(({ label, value, hint, icon: Icon, urgent }, index) => (
          <div key={label} className={`flex min-h-28 items-center justify-between gap-4 p-4 md:p-5 ${index < cells.length - 1 ? "border-b-2 border-line xl:border-r-2 xl:border-b-0" : ""} ${index === 0 && !focusedOrganization ? "bg-brand/15" : ""}`}>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">{label}</p>
              <p className={`mt-2 truncate font-display text-3xl font-extrabold tabular-nums ${urgent ? "text-err" : "text-ink"}`}>{value}</p>
              <p className="mt-1 text-xs text-ink-soft">{hint}</p>
            </div>
            <Icon className={urgent ? "h-5 w-5 shrink-0 text-err" : "h-5 w-5 shrink-0 text-ok"} aria-hidden="true" />
          </div>
        ))}
      </section>
    );
  }
  ```

- [ ] **Step 4: Implement `UsersDirectoryIndex` as a controlled client component.**

  ```tsx
  "use client";

  import { RotateCcw, Search, SlidersHorizontal } from "lucide-react";
  import type { UserControlFilter } from "./users-control-center";

  type UserFilterOption = { value: UserControlFilter; label: string };

  export function UsersDirectoryIndex({
    query,
    activeFilter,
    resultCount,
    filterCounts,
    filters,
    onQueryChange,
    onFilterChange,
    onReset,
  }: {
    query: string;
    activeFilter: UserControlFilter;
    resultCount: number;
    filterCounts: Record<UserControlFilter, number>;
    filters: UserFilterOption[];
    onQueryChange: (value: string) => void;
    onFilterChange: (filter: UserControlFilter) => void;
    onReset: () => void;
  }) {
    return (
      <section aria-label="Index du registre" className="border-y-2 border-line py-4">
        <label className="flex min-w-0 items-center gap-3 border-2 border-line bg-[#fcfbf8] px-3.5 py-3">
          <Search className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Rechercher par nom, email ou organisation…" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft" aria-label="Rechercher un utilisateur" />
        </label>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" aria-hidden="true" /><strong className="text-ink">{resultCount} affiché{resultCount > 1 ? "s" : ""}</strong></span>
          <button type="button" onClick={onReset} disabled={!query && activeFilter === "all"} className="inline-flex items-center gap-1.5 px-2 py-1.5 font-medium hover:bg-clay hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Réinitialiser</button>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtres utilisateurs">
          {filters.map((filter) => {
            const active = activeFilter === filter.value;
            return <button key={filter.value} type="button" onClick={() => onFilterChange(filter.value)} aria-pressed={active} className={`inline-flex shrink-0 items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink-soft hover:bg-clay hover:text-ink"}`}><span>{filter.label}</span><span className={active ? "bg-paper/15 px-1.5 py-0.5 text-[10px] tabular-nums" : "bg-clay px-1.5 py-0.5 text-[10px] tabular-nums text-ink-soft"}>{filterCounts[filter.value]}</span></button>;
          })}
        </div>
      </section>
    );
  }
  ```

  Preserve every current value in `FILTERS`, `aria-pressed`, count, and reset behavior. The narrow-screen filter row scrolls horizontally instead of wrapping into unreadable pills.

- [ ] **Step 5: Verify the components render global and organization labels.**

  Run:

  ```bash
  npx tsx --test src/app/admin/users/UsersRegisterPresentation.test.tsx
  ```

  Expected: PASS. Add a focused-organization fixture that asserts `Membres visibles` and `Routeurs du parc`, rather than global organization totals.

- [ ] **Step 6: Commit presentation components.**

  ```bash
  git add src/app/admin/users/UsersRegisterPriority.tsx src/app/admin/users/UsersDirectoryIndex.tsx src/app/admin/users/UsersRegisterPresentation.test.tsx
  git commit -m "feat: add users register priority and index"
  ```

### Task 4: Recompose the control center around the operational register

**Files:**
- Modify: `src/app/admin/users/UsersControlCenter.tsx`
- Modify: `src/app/admin/users/UsersRegisterPresentation.test.tsx`

- [ ] **Step 1: Add a failing page-order and person-column render test.**

  ```tsx
  import UsersControlCenter from "./UsersControlCenter";

  test("place le registre avant les passes et conserve une colonne personne", () => {
    const markup = renderToStaticMarkup(
      <UsersControlCenter
        rows={[{ id: "member-1", name: "Awa Traoré", email: "awa@example.com", orgName: "Réseaux du Marché", role: "admin", quotaCategory: "free", quotaLabel: "Gratuit", quotaExpiresAt: "2026-08-10T00:00:00.000Z", createdAt: "2026-08-04T00:00:00.000Z" }]}
        superadmin
        temporaryAccess={{ organizations: [], routers: [], grants: [] }}
        organizationFocus={null}
      />,
    );

    assert.ok(markup.indexOf("Repères du registre") < markup.indexOf("Personne"));
    assert.ok(markup.indexOf("Personne") < markup.indexOf("Passes d’accès temporaire"));
    assert.match(markup, /AT/);
  });
  ```

- [ ] **Step 2: Verify RED.**

  Run:

  ```bash
  npx tsx --test src/app/admin/users/UsersRegisterPresentation.test.tsx src/app/admin/users/OrganizationFocusPanel.test.tsx
  ```

  Expected: FAIL because the existing page still shows equal metrics, the old filter block, and passes before the directory.

- [ ] **Step 3: Import the model/components and derive counts once from authorized rows.**

  ```tsx
  import { buildUsersRegisterSummary, userMonogram } from "./users-register";
  import { UsersDirectoryIndex } from "./UsersDirectoryIndex";
  import { UsersRegisterPriority } from "./UsersRegisterPriority";

  const summary = useMemo(() => buildUsersRegisterSummary(rows, now), [now, rows]);
  const filterCounts = useMemo(
    () => Object.fromEntries(FILTERS.map(({ value }) => [value, filterUsers(rows, "", value, now).length])) as Record<UserControlFilter, number>,
    [now, rows],
  );
  ```

  Remove only the now-redundant `expiringRows`, `organizationCount`, `freeCount`, and `paidCount` declarations. Keep `filteredRows`, `exportCsv`, `copyEmail`, `resetFilters`, `FILTERS`, and all action URLs intact.

- [ ] **Step 4: Replace the masthead/metrics/filter sequence with the approved order.**

  ```tsx
  <section className="border-2 border-line bg-paper p-5 sm:p-6">
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div className="max-w-2xl">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-ok"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Station de contrôle</div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">{organizationFocus ? `Utilisateurs de ${organizationFocus.name}` : "Utilisateurs"}</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">{organizationFocus ? `Les membres visibles de ${organizationFocus.name}, avec l’état de ses routeurs.` : superadmin ? "Repérez les comptes, organisations et accès VPN qui demandent une action." : "Les membres de l’équipe qui ont accès à cette organisation SafeLinkHub."}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Link href={superadmin ? "/admin/vpn-access" : "/admin/remote-access"} className="inline-flex items-center gap-2 border-2 border-line bg-paper px-3.5 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-clay"><Wifi className="h-4 w-4" aria-hidden="true" /> Accès VPN</Link>
        <button type="button" onClick={exportCsv} disabled={filteredRows.length === 0} className="inline-flex items-center gap-2 border-2 border-line bg-brand px-3.5 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" aria-hidden="true" /> Exporter la liste</button>
      </div>
    </div>
  </section>
  <UsersRegisterPriority focusedOrganization={organizationFocus} summary={summary} />
  {organizationFocus && <OrganizationFocusPanel focus={organizationFocus} compact />}
  <UsersDirectoryIndex query={query} activeFilter={activeFilter} resultCount={filteredRows.length} filterCounts={filterCounts} filters={FILTERS} onQueryChange={setQuery} onFilterChange={setActiveFilter} onReset={resetFilters} />
  ```

  Remove the hero’s decorative right yellow accent and the old equal-KPI/search/filter sections. Do not alter the server filter in `page.tsx`.

- [ ] **Step 5: Rework only the visual hierarchy inside existing directory rows.**

  Use the following identity block in both mobile cards and the desktop `Personne` cell; replace the desktop `Nom` and `Email` headers with a single `Personne` header:

  ```tsx
  <div className="flex min-w-0 items-center gap-3">
    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center border border-line bg-clay font-display text-xs font-extrabold text-ink">{userMonogram(row.name)}</span>
    <span className="min-w-0"><span className="block truncate font-semibold text-ink">{row.name}</span><span className="mt-0.5 flex truncate text-xs text-ink-soft"><Mail className="mr-1.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{row.email}</span></span>
  </div>
  ```

  Replace the rounded role/quota pills in both responsive renderings with these rectangular status labels, preserving the current quota text and `VpnQuotaForm`:

  ```tsx
  <span className="inline-flex border border-line px-2 py-1 text-xs font-semibold text-ink">{roleLabel(row.role)}</span>
  <span className={`inline-flex border px-2 py-1 text-xs font-semibold ${quotaTone(row.quotaCategory)}`}>{row.quotaLabel}</span>
  ```

  Make `quotaTone` return `border-warn bg-warn/10 text-ink` for paid, `border-ok bg-ok/10 text-ink` for free/unlimited, and `border-line bg-clay text-ink-soft` otherwise. The textual quota label remains required; color never carries the state alone.

- [ ] **Step 6: Move the unchanged temporary-access `details` block below the directory branch.**

  Keep its current data props and disclosure behavior exactly, while using this outer treatment:

  ```tsx
  {superadmin && temporaryAccess && (
    <details className="group overflow-hidden border-2 border-line bg-paper">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-clay/55 marker:hidden md:px-6">
        <span className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center bg-brand/20 text-brand-deep"><Gift className="h-4 w-4" aria-hidden="true" /></span><span className="min-w-0"><span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-brand-deep">Superadmin · gratuit</span><span className="mt-1 block truncate font-semibold text-ink">Passes d’accès temporaire</span></span></span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-line-soft bg-clay/20 p-3 md:p-4"><TemporaryAccessPasses embedded organizations={temporaryAccess.organizations} routers={temporaryAccess.routers} grants={temporaryAccess.grants} /></div>
    </details>
  )}
  ```

- [ ] **Step 7: Verify render, filtering, and focus regression coverage.**

  Run:

  ```bash
  npx tsx --test src/app/admin/users/users-register.test.ts src/app/admin/users/UsersRegisterPresentation.test.tsx src/app/admin/users/OrganizationFocusPanel.test.tsx src/app/admin/users/users-control-center.test.ts
  ```

  Expected: PASS. The current CSV/filter tests and new DOM-order/focused-label tests all pass.

- [ ] **Step 8: Commit the recomposed register.**

  ```bash
  git add src/app/admin/users/UsersControlCenter.tsx src/app/admin/users/UsersRegisterPresentation.test.tsx
  git commit -m "feat: reorganize users operational register"
  ```

### Task 5: Verify the desktop/mobile interface and deliver safely

**Files:**
- Verify: `src/app/admin/users/UsersControlCenter.tsx`
- Verify: `src/app/admin/users/OrganizationFocusPanel.tsx`
- Verify: `src/app/admin/users/users-register.ts`

- [ ] **Step 1: Run the complete Users and router-focus regression set.**

  ```bash
  npx tsx --test \
    src/app/admin/users/users-register.test.ts \
    src/app/admin/users/UsersRegisterPresentation.test.tsx \
    src/app/admin/users/OrganizationFocusPanel.test.tsx \
    src/app/admin/users/organization-focus.test.ts \
    src/app/admin/users/users-control-center.test.ts \
    src/app/admin/router/router-portfolio.test.ts \
    src/app/admin/router/router-portfolio-view.test.ts
  ```

  Expected: all tests pass.

- [ ] **Step 2: Run static and production verification.**

  ```bash
  npx tsc --noEmit
  npm run lint
  npm run build
  git diff --check
  ```

  Expected: TypeScript, build, and diff check pass. If repository-wide lint still reports the known unrelated `VoucherTable.tsx` effect error and `container-setup.ts` warning, report them separately without changing those files.

- [ ] **Step 3: Check the page at desktop and 375 px width.**

  ```bash
  npm run dev -- --port 3100
  agent-browser open http://localhost:3100/admin/users
  agent-browser wait --load networkidle
  agent-browser snapshot -i
  agent-browser set viewport 375 812
  agent-browser screenshot --annotate
  agent-browser eval 'document.querySelector("[data-nextjs-dialog]") ? "ERROR_OVERLAY" : "OK"'
  ```

  Expected: no error overlay, no blank page, visible keyboard focus, horizontally reachable filters, and no overflowing actions. If local authentication redirects to login, record the redirect and use the authenticated server-render coverage above rather than entering production credentials.

- [ ] **Step 4: Inspect scope, commit only intentional work, then merge/deploy under the existing user authorization.**

  ```bash
  git status --short
  git diff --check
  git add docs/superpowers/plans/2026-08-04-users-register-operational-implementation.md
  git commit -m "docs: record users register verification"
  git checkout main
  git merge --ff-only codex/users-register-operational
  git push origin main
  ssh root@31.97.153.83 '/root/deploy-slh.sh'
  ```

  Do not stage the user’s unrelated deleted `.claude/launch.json`, `.codex/` directory, or presentation/PDF files. Verify the deployment script reports a healthy container and HTTP response before reporting delivery.
