# Superadmin Router Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** separate the SafeLinkHub operator fleet from customer fleets in the superadmin router area, then let each customer card open a focused organization view in Users without changing what a customer administrator can access.

**Architecture:** keep authorization and all database reads in the existing server pages. Add small pure view-model helpers for URL scope validation, organization selection, router status aggregation, and client portfolio construction. `/admin/router` will render one shared heading plus either the owner’s operational table, a compact customer-card portfolio, or one customer’s technical table. `/admin/users` will validate `org` server-side and pass a focused organization summary to the existing interactive control center.

**Tech Stack:** Next.js 16 App Router server components, React client components, Drizzle ORM/PostgreSQL, TypeScript, Tailwind CSS design tokens, Lucide, Node test runner through `tsx`.

---

### Task 1: Build and test the pure portfolio/focus view models

**Files:**
- Create: `src/app/admin/router/router-portfolio.ts`
- Create: `src/app/admin/router/router-portfolio.test.ts`
- Create: `src/app/admin/users/organization-focus.ts`
- Create: `src/app/admin/users/organization-focus.test.ts`

- [ ] Define a single router-status classifier in `router-portfolio.ts` so every summary treats `pending` and `installing` as configuration, `online` as online, and every other value as offline:

  ```ts
  export type RouterStatusCounts = {
    total: number;
    online: number;
    offline: number;
    configuring: number;
  };

  export function isConfiguringRouter(status: string) {
    return status === "pending" || status === "installing";
  }

  export function countRouterStatuses(routers: Array<{ status: string }>): RouterStatusCounts {
    return routers.reduce<RouterStatusCounts>((counts, router) => {
      counts.total += 1;
      if (router.status === "online") counts.online += 1;
      else if (isConfiguringRouter(router.status)) counts.configuring += 1;
      else counts.offline += 1;
      return counts;
    }, { total: 0, online: 0, offline: 0, configuring: 0 });
  }
  ```

- [ ] Define `RouterPortfolioScope = "mine" | "clients"` and `parseRouterPortfolioScope(value)` that returns `"clients"` only for the exact URL value and otherwise defaults to `"mine"`. Do not trust a query string to decide authorization.

- [ ] Add `buildClientPortfolios({ ownOrgId, organizations, memberOrgIds, routers })`. It must exclude `ownOrgId`, include every remaining organization that has at least one router **or** member, calculate `memberCount` plus `RouterStatusCounts`, sort by organization name with the French locale, and return only safe display fields:

  ```ts
  export type ClientPortfolio = {
    id: string;
    name: string;
    memberCount: number;
    routerCounts: RouterStatusCounts;
  };
  ```

- [ ] Add `resolveFocusedOrganization(isSuperadmin, requestedOrgId, organizations)`. It must return the matching `{ id, name }` only for a superadmin and only when the id occurs in the server-supplied organization list; it must return `null` for missing, forged, or non-superadmin selections.

- [ ] Test the public helper behavior with `node:test` and strict assertions:

  ```ts
  test("buildClientPortfolios excludes the operator organization and retains a client with members but no router", () => {
    const portfolios = buildClientPortfolios({
      ownOrgId: "safe",
      organizations: [{ id: "safe", name: "SafeLinkHub" }, { id: "client", name: "Alpha" }],
      memberOrgIds: ["client", "client"],
      routers: [{ orgId: "safe", status: "online" }],
    });

    assert.deepEqual(portfolios, [{
      id: "client", name: "Alpha", memberCount: 2,
      routerCounts: { total: 0, online: 0, offline: 0, configuring: 0 },
    }]);
  });
  ```

- [ ] Add cases for the four status buckets, default/valid router scope, a valid focus id, a forged focus id, and a non-superadmin request. These tests are the regression guard against another all-client list or a cross-organization URL leak.

### Task 2: Make `/admin/router` resolve the scope and data server-side

**Files:**
- Modify: `src/app/admin/router/page.tsx`

- [ ] Update the Next.js page signature to await query parameters, preserving the Next 16 convention:

  ```ts
  type RouterPageProps = {
    searchParams: Promise<{ scope?: string; org?: string }>;
  };

  export default async function RouterDashboardPage({ searchParams }: RouterPageProps) {
    const params = await searchParams;
    // …
  }
  ```

- [ ] Keep the existing `after(() => refreshStaleRouters(session.orgId))` behavior exactly scoped to the signed-in organization. This UI change must not start background synchronization of every customer merely because a superadmin opens a portfolio page.

- [ ] For a normal admin, retain the existing `where(eq(routers.orgId, session.orgId))` query and render only their own table. Ignore both `scope` and `org` in this branch so an admin cannot use the address bar to select another organization.

- [ ] For a superadmin, fetch the minimal server-side input needed to construct the portfolio: organizations (`id`, `name`), user `orgId` values, and router fields currently mapped to `RouterRow` plus `orgId`. Pass that input to `buildClientPortfolios`; do not hand an all-customer router collection to a client component.

- [ ] In the `mine` scope, filter router rows by `router.orgId === session.orgId`, then render the existing operational table. In the `clients` scope without a valid `org`, render only client cards. In the `clients` scope with a valid client id, filter rows to that one client and render the technical table for that client. Invalid or own-organization `org` values must fall back to the client-card portfolio.

- [ ] Keep the server-to-client router mapping explicit, including `id`, `name`, `model`, `host`, `apiPort`, `status`, `cpuLoad`, `memoryUsage`, `activeUsers`, `lastSyncAtMs`, `connectionMethod`, and `locked`. Do not add a schema migration or expose credentials, tunnel keys, installation tokens, or any encrypted field.

### Task 3: Add the shared SafeLinkHub portfolio navigation and customer cards

**Files:**
- Create: `src/app/admin/router/RouterPortfolioTabs.tsx`
- Create: `src/app/admin/router/ClientPortfolioGrid.tsx`
- Modify: `src/app/admin/router/page.tsx`

- [ ] Implement `RouterPortfolioTabs` as a server component receiving `activeScope` and rendering two normal `next/link` links:

  ```tsx
  <Link href="/admin/router?scope=mine" aria-current={activeScope === "mine" ? "page" : undefined}>
    Mon parc
  </Link>
  <Link href="/admin/router?scope=clients" aria-current={activeScope === "clients" ? "page" : undefined}>
    Parcs clients
  </Link>
  ```

  Use the existing paper/black-border/mustard selected style (`bg-brand`, `border-2 border-line`) rather than introducing a new color system. The page owns the only `h1` (`Routeurs MikroTik`), then places these tabs directly below it.

- [ ] Implement `ClientPortfolioGrid` as a server component accepting `ClientPortfolio[]`. Each customer card must show organization name, number of users, total routers, and separate green/amber/red status counts. Use `Router`, `Users`, `CircleAlert`, and `ArrowUpRight` icons only as visual reinforcement; the text must carry the information itself.

- [ ] Make the two card actions unambiguous and keep their identifiers URL-encoded by `URLSearchParams` or static template values from trusted UUIDs:

  ```tsx
  <Link href={`/admin/users?org=${client.id}`}>Ouvrir l’organisation <ArrowUpRight /></Link>
  <Link href={`/admin/router?scope=clients&org=${client.id}`}>Voir les routeurs <ArrowUpRight /></Link>
  ```

- [ ] Provide an empty state for zero eligible customer organizations. A customer with users but no router is not an empty state: it remains a card with a zero-router metric and an enabled organization link.

- [ ] In the selected-customer table view, add a visible return link to `/admin/router?scope=clients`, identify the selected organization in the table introduction, and avoid any mention of unrelated customers. The layout must collapse to one card column on mobile and retain keyboard-visible focus styles.

### Task 4: Refactor the router table into a one-organization operational view

**Files:**
- Modify: `src/app/admin/router/RoutersTable.tsx`
- Modify: `src/app/admin/router/SyncAllButton.tsx` only if a prop is required to make the scope clear

- [ ] Remove the `crossOrg` presentation branch, the client-name select filter, and every `orgName` search/display path. After Task 2, the table always receives rows from exactly one authorized organization; retaining a hidden all-client mode would invite the original confusion back.

- [ ] Preserve the existing status chips, local search, desktop table, mobile cards, router row actions, details links, metric bars, and empty state. Change the search placeholder to `Rechercher par nom, IP ou identité…`.

- [ ] Introduce explicit table-view props so the same component can render a signed-in organization and an inspected customer without duplicating UI:

  ```ts
  type RoutersTableProps = {
    routers: RouterRow[];
    title?: string;
    description?: string;
    backHref?: string;
    backLabel?: string;
    showFleetActions?: boolean;
  };
  ```

  Default `showFleetActions` to `true`. Pass `false` for a selected client so the header does not show `Synchroniser`, `Sauvegardes`, or `Lier un MikroTik`: `refreshAllRouters()` deliberately synchronizes only the session organization and must never look like a client-wide bulk action.

- [ ] Update the debounced URL write so it preserves `scope` and a validated server-selected `org` while replacing only table-owned filters. The implementation must start from the current parameters, delete only `status` and `q`, then put them back if active:

  ```ts
  const params = new URLSearchParams(searchParams);
  params.delete("status");
  params.delete("q");
  if (filter !== "all") params.set("status", filter);
  if (query) params.set("q", query);
  ```

- [ ] Keep `RouterRowActions` and individual router detail links in the client view. Their existing server authorization checks allow a superadmin intervention without pretending that client data belongs to the SafeLinkHub fleet.

### Task 5: Add a focused organization view to `/admin/users`

**Files:**
- Modify: `src/app/admin/users/page.tsx`
- Modify: `src/app/admin/users/UsersControlCenter.tsx`
- Modify: `src/app/admin/users/users-control-center.ts`

- [ ] Update `UsersPage` to await `searchParams: Promise<{ org?: string }>` and call `resolveFocusedOrganization(superadmin, params.org, availableOrganizations)` before selecting user records. A normal admin must always receive `null` focus, even if `org` occurs in the database.

- [ ] When a valid focus is present, add `where(eq(users.orgId, focusedOrganization.id))` to the existing user query and retrieve that organization’s router summary with only display-safe columns (`id`, `name`, `model`, `status`, `activeUsers`). When absent or invalid, preserve the current all-visible-user behavior.

- [ ] Derive router counts with `countRouterStatuses` and pass a serializable focus object to the client component:

  ```ts
  type OrganizationFocus = {
    id: string;
    name: string;
    memberCount: number;
    routerCounts: RouterStatusCounts;
    routers: Array<{ id: string; name: string; model: string | null; status: string; activeUsers: number | null }>;
  };
  ```

- [ ] Extend `UsersControlCenter` with `organizationFocus: OrganizationFocus | null`. When present, render a bordered focus panel immediately below the existing hero. It must show the organization name, user/router/status counts, a compact router list with status text and a link to each existing `/admin/router/[id]` detail page, a return link to `/admin/router?scope=clients`, and a link back to the selected technical table.

- [ ] Change the hero copy and accessible table caption when focus is present so they say this is one organization’s users rather than the global station. Keep existing search, filters, CSV export, quota forms, and temporary-access controls working on the server-filtered rows.

- [ ] Do not modify the schema, the remote-access permission model, or route-level authorization. A malformed `org` parameter must render the normal Users view rather than a partially populated customer panel or an error page.

### Task 6: Verify the full flow, accessibility, and regressions

**Files:**
- Test: `src/app/admin/router/router-portfolio.test.ts`
- Test: `src/app/admin/users/organization-focus.test.ts`
- Test: existing `src/app/admin/users/users-control-center.test.ts`

- [ ] Run the focused unit tests:

  ```bash
  npx tsx --test \
    src/app/admin/router/router-portfolio.test.ts \
    src/app/admin/users/organization-focus.test.ts \
    src/app/admin/users/users-control-center.test.ts
  ```

- [ ] Run static and production checks from the repository root:

  ```bash
  npx tsc --noEmit
  npm run lint
  npm run build
  ```

- [ ] Manually verify as superadmin: default `/admin/router` is `Mon parc`; `?scope=clients` contains no SafeLinkHub router row; a client card opens both `/admin/users?org=<id>` and its technical router list; table search/status filters retain `scope` and `org`; an invalid `org` returns to the client portfolio/general users view.

- [ ] Manually verify as a client admin: `/admin/router?scope=clients&org=<another-id>` remains their own normal router view and `/admin/users?org=<another-id>` remains their own normal user view. Verify tab focus, descriptive link labels, and one-column mobile card layout.

### Task 7: Deliver the approved production change

**Files:**
- Modify: only the files produced by Tasks 1–5, plus this plan/spec if amended during implementation

- [ ] Inspect `git diff --check` and `git status --short`; stage only the router-portfolio implementation, associated tests, and deliberate documentation. Leave the user’s unrelated local deletion and untracked presentation/PDF files untouched.

- [ ] Commit with `feat: separate superadmin router portfolios`, push `main`, and deploy through the existing production workflow on the Hostinger VPS. The deployment must use the committed image tag, preserve the current runtime environment file and Traefik network, and retain the known-good rollback container.

- [ ] Confirm the deployed container is healthy, `https://safelinkhub.io/admin/router` returns successfully, and the production navigation exposes both `Mon parc` and `Parcs clients`. Report the commit and deployment result without exposing credentials or environment secrets.

