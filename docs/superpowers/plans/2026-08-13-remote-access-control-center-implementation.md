# Remote Access Control Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the long remote-access page with a responsive fleet control center that highlights priority issues, supports search and filters, and opens non-sensitive router details without losing existing remote-access operations.

**Architecture:** `/admin/remote-access/page.tsx` stays a Server Component. It authorizes the organization, schedules stale-status refresh, queries a minimal router/access/audit projection, and serializes it to a focused Client Component. The Client Component owns selection and filtering. The existing technical flows move to an authorized router workspace; the tunnel installer opens in an accessible dialog.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Tailwind CSS 4, Drizzle ORM, lucide-react, Node test runner through `tsx`.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/lib/remote-access/control-center.ts` | Safe DTOs, labels, metrics, priority and filter functions. |
| `src/lib/remote-access/control-center.test.ts` | Pure unit coverage. |
| `src/app/admin/remote-access/page.tsx` | Authorized query and non-secret data mapping. |
| `src/app/admin/remote-access/loading.tsx` | Route loading skeleton. |
| `src/app/admin/remote-access/RemoteAccessControlCenter.tsx` | Metrics, alert, filters, list/cards and details panel. |
| `src/app/admin/remote-access/RemoteAccessControlCenter.test.tsx` | Component contract coverage. |
| `src/app/admin/remote-access/RemoteAccessTunnelDialog.tsx` | Accessible installer dialog. |
| `src/app/admin/remote-access/[id]/page.tsx` | Router-scoped workspace that preserves existing technical controls. |
| `src/app/admin/remote-access/[id]/loading.tsx` | Workspace skeleton. |
| `src/app/admin/remote-access/RemoteAccessSidebar.tsx` | Delete once no import remains. |

No database migration is needed. The existing `routers`, `router_port_forwards`, `router_replacements` and `vpn_access_audit_events` tables contain all required non-secret state.

### Task 1: Add the control-center view model

**Files:**

- Create: `src/lib/remote-access/control-center.ts`
- Create: `src/lib/remote-access/control-center.test.ts`

- [ ] **Step 1: Write the failing unit tests**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { filterControlCenterRouters, getControlCenterMetrics, sortControlCenterRouters, type RemoteAccessControlRouter } from "./control-center";

const routers: RemoteAccessControlRouter[] = [
  { id: "online", name: "SHIA-HSPT", status: "online", lastSyncAt: "2026-08-13T10:00:00.000Z", connectionMethod: "vpn", tunnelIp: "10.0.0.2", ipv6BypassEnabled: false, activeForwards: [{ id: "f1", service: "webfig", publicPort: 20111, endpoint: "https://s3.example:20111", expiresAt: null }], auditEvents: [], replacementStatus: null },
  { id: "offline", name: "HSPT-TOFESSO", status: "offline", lastSyncAt: "2026-08-13T09:00:00.000Z", connectionMethod: "vpn", tunnelIp: "10.0.0.3", ipv6BypassEnabled: false, activeForwards: [{ id: "f2", service: "ssh", publicPort: 39055, endpoint: "s3.example:39055", expiresAt: null }], auditEvents: [], replacementStatus: null },
  { id: "new", name: "NOUVEAU-SITE", status: "pending", lastSyncAt: null, connectionMethod: "direct", tunnelIp: null, ipv6BypassEnabled: false, activeForwards: [], auditEvents: [], replacementStatus: null },
];

test("sépare disponibilité, accès, vérifications et actions", () => {
  assert.deepEqual(getControlCenterMetrics(routers), { routerCount: 3, onlineCount: 1, activeAccessCount: 2, verificationCount: 1, actionRequiredCount: 1 });
});

test("ordonne les actions avant les vérifications", () => {
  assert.deepEqual(sortControlCenterRouters(routers).map((router) => router.id), ["new", "offline", "online"]);
});

test("recherche l’endpoint et applique le filtre d’attention", () => {
  assert.deepEqual(filterControlCenterRouters(routers, { query: "20111", status: "all", method: "all", incidentOnly: false }).map((router) => router.id), ["online"]);
  assert.deepEqual(filterControlCenterRouters(routers, { query: "", status: "attention", method: "all", incidentOnly: false }).map((router) => router.id), ["offline", "new"]);
});
```

- [ ] **Step 2: Run the test and verify it fails because the module is missing**

Run: `npx tsx --test src/lib/remote-access/control-center.test.ts`

Expected: FAIL with `Cannot find module './control-center'`.

- [ ] **Step 3: Implement the helper API**

Export these types:

```ts
export type RemoteAccessControlForward = { id: string; service: string; publicPort: number; endpoint: string | null; expiresAt: string | null };
export type RemoteAccessAuditEvent = { id: string; action: string; createdAt: string };
export type RemoteAccessControlRouter = {
  id: string; name: string; status: string; lastSyncAt: string | null;
  connectionMethod: string; tunnelIp: string | null; ipv6BypassEnabled: boolean;
  activeForwards: RemoteAccessControlForward[]; auditEvents: RemoteAccessAuditEvent[]; replacementStatus: string | null;
};
export type ControlCenterFilters = { query: string; status: "all" | "online" | "attention"; method: "all" | "wireguard" | "openvpn" | "direct"; incidentOnly: boolean };
```

Export `connectionMethodLabel`, `routerStatusLabel`, `serviceLabel`, `requiresAction`, `requiresVerification`, `getControlCenterMetrics`, `sortControlCenterRouters`, and `filterControlCenterRouters`. WireGuard/OpenVPN/other labels are WireGuard/OpenVPN/Sans tunnel. Pending, installing and failed replacement rows need action; non-online, non-replaced rows that do not need action require verification. Sort by action, verification, online, then French locale router name. Search only name, tunnel label, service label and public endpoint.

- [ ] **Step 4: Run the unit tests and typecheck**

Run: `npx tsx --test src/lib/remote-access/control-center.test.ts && npm run typecheck`

Expected: 3 passing tests and no TypeScript errors.

- [ ] **Step 5: Commit the view model**

Run: `git add src/lib/remote-access/control-center.ts src/lib/remote-access/control-center.test.ts && git commit -m "feat(remote-access): add control center view model"`

### Task 2: Feed the control center with an authorized non-secret projection

**Files:**

- Modify: `src/app/admin/remote-access/page.tsx`
- Create: `src/app/admin/remote-access/loading.tsx`

- [ ] **Step 1: Add the dynamic-route fallback**

```tsx
export default function RemoteAccessLoading() {
  return <div className="animate-pulse space-y-6" aria-label="Chargement des accès distants"><div className="h-8 w-56 bg-clay" /><div className="h-5 w-full max-w-2xl bg-clay" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-28 border-2 border-line bg-paper" />)}</div><div className="h-96 border-2 border-line bg-paper" /></div>;
}
```

- [ ] **Step 2: Replace the old long-page layout with the DTO mapping**

Keep current session authorization, `after(() => refreshStaleRouters(session.orgId))`, organization-scoped `routers` and forwards queries, `listActiveGrantsForOrg`, `getRelayPublicHost`, and `getActiveRouterReplacement`. Remove imports/rendering of `RemoteAccessSidebar`, `RemoteAccessTabs`, `BackToHomeSection`, `DirectAccessSection`, `Ipv6BypassSection`, and `RouterReplacementSection`.

Add `vpnAccessAuditEvents` to the schema import. Select `id`, `routerId`, `action`, `createdAt` for the page router IDs, order newest first, and retain the first three events per router. Build one DTO per router with active forwards only. Use `getRelayPublicHost(router.relayShard)` and set `endpoint` to `https://${host}:${port}` only for `webfig` and `mikhmon`; use `${host}:${port}` for other services. Convert each date to ISO string.

Pass the DTO list, the number of active temporary grants, and the earliest active-grant expiry ISO string to `RemoteAccessControlCenter`. Never select or serialize `passwordEncrypted`, install-token fields, or `wgPeerPublicKey`.

- [ ] **Step 3: Run static checks**

Run: `npm run typecheck && npm run lint`

Expected: both commands exit 0.

- [ ] **Step 4: Commit the server projection**

Run: `git add src/app/admin/remote-access/page.tsx src/app/admin/remote-access/loading.tsx && git commit -m "feat(remote-access): query safe control center data"`

### Task 3: Implement the control-center interaction surface

**Files:**

- Create: `src/app/admin/remote-access/RemoteAccessControlCenter.tsx`
- Create: `src/app/admin/remote-access/RemoteAccessControlCenter.test.tsx`

- [ ] **Step 1: Add a failing static component contract**

```tsx
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import RemoteAccessControlCenter from "./RemoteAccessControlCenter";

const routers = [{ id: "r1", name: "SHIA-HSPT", status: "online", lastSyncAt: "2026-08-13T10:00:00.000Z", connectionMethod: "vpn", tunnelIp: "10.0.0.2", ipv6BypassEnabled: false, activeForwards: [{ id: "f1", service: "webfig", publicPort: 20111, endpoint: "https://s3.example:20111", expiresAt: null }], auditEvents: [], replacementStatus: null }];

test("rend les métriques, la recherche et le détail", () => {
  const markup = renderToStaticMarkup(<RemoteAccessControlCenter routers={routers} temporaryPassCount={0} temporaryPassExpiresAt={null} />);
  assert.match(markup, /Routeurs en ligne/);
  assert.match(markup, /Rechercher un routeur, un accès ou un endpoint/);
  assert.match(markup, /SHIA-HSPT/);
  assert.match(markup, /https:\/\/s3\.example:20111/);
});

test("affiche le CTA tunnel quand le parc est vide", () => {
  const markup = renderToStaticMarkup(<RemoteAccessControlCenter routers={[]} temporaryPassCount={0} temporaryPassExpiresAt={null} />);
  assert.match(markup, /Aucun routeur configuré/);
  assert.match(markup, /Installer un tunnel/);
});
```

- [ ] **Step 2: Run the component test and verify it fails**

Run: `npx tsx --test src/app/admin/remote-access/RemoteAccessControlCenter.test.tsx`

Expected: FAIL with `Cannot find module './RemoteAccessControlCenter'`.

- [ ] **Step 3: Build the client UI**

Use `useMemo` and `useState` for `query`, status filter, method filter, incident toggle, selected router ID, mobile drawer state, copy feedback and focus restoration. Derive filtered routers, metrics and priority router from Task 1 helpers. When filtering removes the selected router, show the first filtered router.

Render in this order: page header with `RemoteAccessTunnelDialog`; four written metric cards; conditional priority band whose button enables incident-only filtering; optional compact temporary-pass notice; labelled search input, two selects, incident toggle and reset control; desktop table; mobile cards; selected-router detail panel; and empty states for a fleet without routers or filters without results.

The table exposes Router, Tunnel, Accès and État plus a dedicated workspace link. A row button selects the router and is never wrapped around another interactive element. The panel shows non-secret endpoints, copy controls with 1.5-second success feedback, up to three audit actions, and a link to `/admin/remote-access/${router.id}`. Browser access links alone use `target="_blank" rel="noreferrer"`.

At `xl` the detail is a sticky side panel. Below `xl`, it is a `role="dialog" aria-modal="true"` drawer that closes with its 44px close button and Escape, then returns focus to the row. State is always written as text plus icon/color. Use `paper`, `line`, `clay`, `ink`, `brand`, `ok`, `warn`, and `err` classes, not new global tokens.

- [ ] **Step 4: Run focused tests**

Run: `npx tsx --test src/lib/remote-access/control-center.test.ts src/app/admin/remote-access/RemoteAccessControlCenter.test.tsx`

Expected: 5 passing tests.

- [ ] **Step 5: Commit the UI**

Run: `git add src/app/admin/remote-access/RemoteAccessControlCenter.tsx src/app/admin/remote-access/RemoteAccessControlCenter.test.tsx && git commit -m "feat(remote-access): build fleet control center"`

### Task 4: Preserve all technical operations behind focused routes

**Files:**

- Create: `src/app/admin/remote-access/RemoteAccessTunnelDialog.tsx`
- Create: `src/app/admin/remote-access/[id]/page.tsx`
- Create: `src/app/admin/remote-access/[id]/loading.tsx`
- Modify: `src/app/admin/remote-access/DirectAccessSection.tsx`
- Delete: `src/app/admin/remote-access/RemoteAccessSidebar.tsx`

- [ ] **Step 1: Implement the tunnel dialog**

Create a client component with an “Installer un tunnel” trigger and a panel marked `role="dialog" aria-modal="true" aria-labelledby="tunnel-dialog-title"`. It renders unchanged `RemoteAccessTabs`, uses a 44px close button, handles Escape, and returns focus to its trigger after closing with `requestAnimationFrame`.

- [ ] **Step 2: Create the per-router workspace**

Await `params`, authenticate `getSession()`, and authorize with both router ID and `router.orgId === session.orgId`; use `notFound()` for an absent or out-of-scope router. Keep stale refresh in `after`. Query active forwards only. Render a Back link, `Espace routeur` header, then the existing `DirectAccessSection`, `BackToHomeSection`, `Ipv6BypassSection`, and `RouterReplacementSection`, each scoped to the single router.

The DTO passed to Direct Access must include `id`, `name`, `status`, `connectionMethod`, `tunnelIp`, `username`, and shard-aware `relayHost`. The IPv6 DTO adds `ipv6BypassEnabled`. The replacement row includes only active service/port pairs and `await getActiveRouterReplacement(router.id)`. The route never queries a password, install token or private key. Add a loading page with a header skeleton and four `h-48` paper blocks.

- [ ] **Step 3: Confirm critical Direct Access actions**

Modify `DirectAccessSection.tsx`: `handleEnable` and `handleDisable` set a confirmation state first. The dialog identifies the router and service, states that activation can create a paid public endpoint or disabling revokes an endpoint, and invokes the existing server action only after an explicit confirmation. Cancel invokes neither action. Preserve the authorization/paywall result handling, make errors `aria-live="polite"`, support Escape and return trigger focus.

- [ ] **Step 4: Delete the obsolete sidebar only after checking references**

Run: `rg -n "RemoteAccessSidebar" src`

Expected: no results.

Run: `git rm src/app/admin/remote-access/RemoteAccessSidebar.tsx`

- [ ] **Step 5: Verify and commit preserved operations**

Run: `npm run typecheck && npx tsx --test src/lib/remote-access/control-center.test.ts src/app/admin/remote-access/RemoteAccessControlCenter.test.tsx`

Expected: no type error and 5 passing tests.

Run: `git add src/app/admin/remote-access/RemoteAccessTunnelDialog.tsx src/app/admin/remote-access/[id]/page.tsx src/app/admin/remote-access/[id]/loading.tsx src/app/admin/remote-access/DirectAccessSection.tsx && git commit -m "feat(remote-access): scope operations to router workspaces"`

### Task 5: Verify the full journey

**Files:**

- Modify only a file proven defective by this task.

- [ ] **Step 1: Run all automated checks**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all commands exit 0 with no new route, lint or type failure.

- [ ] **Step 2: Manually check the browser flow**

Run: `npm run dev`

At `/admin/remote-access`, confirm metrics agree with the fleet; the priority band names the highest-priority router; search and every filter work; row selection and copying work; and mobile drawer focus returns after Escape. Confirm the tunnel dialog changes methods and closes with Escape. Open the router workspace and ensure all four existing technical sections apply only to that router. Start Direct Access activation and revocation, then cancel both confirmations to confirm neither endpoint changes.

- [ ] **Step 3: Commit validation fixes only if source changes were needed**

Run: `git add src/app/admin/remote-access src/lib/remote-access && git commit -m "fix(remote-access): polish control center accessibility"`

## Acceptance mapping

| Requirement | Tasks |
| --- | --- |
| Priority alert and action filtering | 1, 3 |
| Separate availability/access/risk metrics | 1, 3 |
| Scannable router fleet table | 3 |
| Detail without losing fleet context | 3 |
| Search and filters | 1, 3 |
| Existing operations retained | 4 |
| No secrets in list payload | 2, 4 |
| Confirm sensitive actions | 4 |
| Responsive and keyboard accessible | 3, 5 |
