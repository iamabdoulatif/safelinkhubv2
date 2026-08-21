# Roaming Persistent Autologin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each roaming account automatically reconnect its one remembered device on every selected MikroTik, expose per-zone sync state, and retry zones that return online without bypassing voucher expiry.

**Architecture:** Persist the canonical MAC binding and its result per router in PostgreSQL. The signed RouterOS `on-login` webhook creates or confirms that binding, then idempotently materializes it as a RouterOS companion user on each group member. The router health path reconciles pending bindings using the connection it already opened; server actions offer explicit resync and device replacement, while the existing voucher/revocation paths remain the authority for expiry and deletion.

**Tech Stack:** Next.js 16 App Router, React 19 `useActionState`, TypeScript, Drizzle ORM/PostgreSQL, RouterOS API client, Tailwind CSS 4, Lucide, Node test runner via `tsx`.

---

## File structure

- `scripts/add-roaming-device-bindings.sql` — additive, re-runnable production migration for the binding and per-router status tables.
- `src/lib/db/schema.ts` — Drizzle representations of both new tables and their constraints.
- `src/lib/roaming/device-binding.ts` — pure MAC validation, status summarisation and retry eligibility helpers.
- `src/lib/roaming/device-binding.test.ts` — unit tests for the pure helper contract.
- `src/lib/roaming/mac-propagate.ts` — transactional binding creation, per-zone persistence and idempotent RouterOS materialisation.
- `src/lib/roaming/mac-propagate.test.ts` — mocked RouterOS/database integration seams for first bind, second-device refusal and pending-zone recovery.
- `src/lib/roaming/provision.ts` — reuse the shared reconciler when a group gains a zone; clear binding artifacts during account deletion.
- `src/lib/roaming/actions.ts` — protected resync and replace-device actions.
- `src/lib/mikrotik/hotspot-login-mode.ts` — long-lived HTTP/MAC cookie profile reconciliation without dropping active login methods.
- `src/lib/mikrotik/hotspot-login-mode.test.ts` — cookie lifetime and login-method regression coverage.
- `src/lib/mikrotik/router-sync.ts` — call the pending-binding reconciler after a router becomes healthy.
- `src/app/api/cron/voucher-expiry-sync/route.ts` — bounded periodic safety retry for pending roaming bindings.
- `src/app/admin/roaming/page.tsx` — load binding summary and per-zone state for named roaming accounts.
- `src/app/admin/roaming/RoamingConsole.tsx` — display sync visibility plus Resynchroniser and Changer d'appareil actions.
- `test/roaming-named-user.test.mjs` — guard that the account UI retains the new actions and states.

### Task 1: Lock the persistent-binding contract in pure tests

**Files:**
- Create: `src/lib/roaming/device-binding.ts`
- Create: `src/lib/roaming/device-binding.test.ts`

- [ ] **Step 1: Write the failing helper tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeRoamingMac, summarizeBindingRouters } from "./device-binding";

describe("liaison d'appareil roaming", () => {
  it("normalise une MAC et rejette une valeur incomplète", () => {
    assert.equal(normalizeRoamingMac("aa-bb-cc-dd-ee-ff"), "AA:BB:CC:DD:EE:FF");
    assert.equal(normalizeRoamingMac("AA:BB:CC"), "");
  });

  it("distingue les zones synchronisées de celles à reprendre", () => {
    assert.deepEqual(
      summarizeBindingRouters([
        { routerId: "nord", status: "SYNCED", lastError: null },
        { routerId: "sud", status: "PENDING", lastError: null },
        { routerId: "est", status: "ERROR", lastError: "timeout" },
      ]),
      { total: 3, synced: 1, pending: 2, errors: ["timeout"] },
    );
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --test-name-pattern='liaison d.appareil roaming'`

Expected: FAIL because `device-binding.ts` does not exist.

- [ ] **Step 3: Add the minimal typed helpers**

```ts
export type DeviceBindingRouterState = {
  routerId: string;
  status: "PENDING" | "SYNCED" | "ERROR";
  lastError: string | null;
};

export function normalizeRoamingMac(raw: string): string {
  const hex = raw.replace(/[^0-9a-f]/gi, "").toUpperCase();
  return hex.length === 12 ? (hex.match(/.{2}/g) ?? []).join(":") : "";
}

export function summarizeBindingRouters(rows: DeviceBindingRouterState[]) {
  const errors = rows.flatMap((row) => (row.status === "ERROR" && row.lastError ? [row.lastError] : []));
  return { total: rows.length, synced: rows.filter((row) => row.status === "SYNCED").length, pending: rows.filter((row) => row.status !== "SYNCED").length, errors };
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- --test-name-pattern='liaison d.appareil roaming'`

Expected: PASS.

- [ ] **Step 5: Commit the contract**

```bash
git add src/lib/roaming/device-binding.ts src/lib/roaming/device-binding.test.ts
git commit -m "test(roaming): define device binding contract"
```

### Task 2: Add an additive, enforceable persistence model

**Files:**
- Create: `scripts/add-roaming-device-bindings.sql`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Write the migration before schema code**

```sql
CREATE TABLE IF NOT EXISTS roaming_device_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  voucher_id uuid NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  mac_address text NOT NULL,
  bound_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  revoked_at timestamp,
  CONSTRAINT roaming_device_bindings_voucher_key UNIQUE (voucher_id)
);

CREATE TABLE IF NOT EXISTS roaming_device_binding_routers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id uuid NOT NULL REFERENCES roaming_device_bindings(id) ON DELETE CASCADE,
  router_id uuid NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  last_attempt_at timestamp,
  synced_at timestamp,
  CONSTRAINT roaming_device_binding_routers_binding_router_key UNIQUE (binding_id, router_id),
  CONSTRAINT roaming_device_binding_routers_status_check CHECK (status IN ('PENDING', 'SYNCED', 'ERROR'))
);

CREATE INDEX IF NOT EXISTS roaming_device_bindings_org_voucher_idx ON roaming_device_bindings(org_id, voucher_id);
CREATE INDEX IF NOT EXISTS roaming_device_binding_routers_router_status_idx ON roaming_device_binding_routers(router_id, status);
```

- [ ] **Step 2: Add the matching Drizzle schema**

```ts
export const roamingDeviceBindings = pgTable("roaming_device_bindings", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  voucherId: uuid("voucher_id").notNull().references(() => vouchers.id, { onDelete: "cascade" }),
  macAddress: text("mac_address").notNull(),
  boundAt: timestamp("bound_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
}, (t) => [uniqueIndex("roaming_device_bindings_voucher_idx").on(t.voucherId)]);
```

Define `roamingDeviceBindingRouters` with `bindingId`, `routerId`, `status`, `attempts`, `lastError`, `lastAttemptAt` and `syncedAt`, plus the same unique `(bindingId, routerId)` index as the migration.

- [ ] **Step 3: Verify the migration is safe to re-run**

Run: `rg -n "CREATE TABLE IF NOT EXISTS|CREATE INDEX IF NOT EXISTS|roaming_device_bindings" scripts/add-roaming-device-bindings.sql src/lib/db/schema.ts`

Expected: every created table and index is additive, and the schema includes both tables.

- [ ] **Step 4: Commit the persistence model**

```bash
git add scripts/add-roaming-device-bindings.sql src/lib/db/schema.ts
git commit -m "feat(roaming): persist device bindings by zone"
```

### Task 3: Make propagation transactional, visible and repeatable

**Files:**
- Modify: `src/lib/roaming/mac-propagate.ts`
- Create: `src/lib/roaming/mac-propagate.test.ts`

- [ ] **Step 1: Write failing propagation tests through injected seams**

```ts
test("keeps the first verified MAC and marks an unreachable zone pending", async () => {
  const result = await reconcileRoamingDeviceBinding({ reporterRouterId: "nord", username: "latif", mac: "AA-BB-CC-DD-EE-FF" }, fakes);
  assert.equal(result.ok, true);
  assert.deepEqual(fakes.binding, { voucherId: "voucher-1", macAddress: "AA:BB:CC:DD:EE:FF" });
  assert.equal(fakes.zoneStates.get("nord")?.status, "SYNCED");
  assert.equal(fakes.zoneStates.get("sud")?.status, "PENDING");
});

test("does not replace a remembered device after a second MAC login", async () => {
  fakes.binding = { voucherId: "voucher-1", macAddress: "AA:BB:CC:DD:EE:FF" };
  const result = await reconcileRoamingDeviceBinding({ reporterRouterId: "nord", username: "latif", mac: "11:22:33:44:55:66" }, fakes);
  assert.deepEqual(result, { ok: false, reason: "bound-elsewhere" });
  assert.equal(fakes.routerWrites.length, 0);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- --test-name-pattern='first verified MAC|second MAC login'`

Expected: FAIL because the new reconciler and injected repository/client seams do not exist.

- [ ] **Step 3: Extract a reusable reconciler and retain the webhook wrapper**

```ts
export async function reconcileRoamingDeviceBinding(input: {
  reporterRouterId: string;
  username: string;
  mac: string;
  onlyRouterId?: string;
}): Promise<PropagateResult> {
  // Verify the active RouterOS session before binding.
  // Atomically insert/read one canonical binding per voucher.
  // Upsert PENDING state for each group router.
  // Materialize each reachable zone; write SYNCED only after all RouterOS commands succeed.
  // Persist ERROR/PENDING and preserve the successful zones when one router is unavailable.
}

export const propagateRoamingMac = reconcileRoamingDeviceBinding;
```

Use `onConflictDoNothing` followed by a constrained read for the binding insert. Never overwrite an existing distinct `macAddress`. Increment `attempts` and write `lastAttemptAt` for every attempted zone. Only the successfully created/updated MAC companion user may set `status: "SYNCED"` and `syncedAt`.

- [ ] **Step 4: Run the propagation tests and verify GREEN**

Run: `npm test -- --test-name-pattern='first verified MAC|second MAC login'`

Expected: PASS. The existing `src/app/api/roaming/seen/route.ts` remains an immediate `202` response and continues to call the exported wrapper inside `after()`.

- [ ] **Step 5: Commit the retryable propagation**

```bash
git add src/lib/roaming/mac-propagate.ts src/lib/roaming/mac-propagate.test.ts src/app/api/roaming/seen/route.ts
git commit -m "feat(roaming): reconcile remembered devices across zones"
```

### Task 4: Reconcile automatically when a MikroTik returns

**Files:**
- Modify: `src/lib/mikrotik/router-sync.ts`
- Modify: `src/app/api/cron/voucher-expiry-sync/route.ts`
- Create: `src/lib/roaming/pending-binding-retry.test.ts`

- [ ] **Step 1: Write the failing recovery test**

```ts
test("retries pending roaming bindings when a router recovers", async () => {
  const calls: string[] = [];
  await retryPendingRoamingBindingsForRouter("router-sud", {
    reconcile: async (input) => calls.push(`${input.username}:${input.onlyRouterId}`),
    loadPending: async () => [{ username: "latif" }],
  });
  assert.deepEqual(calls, ["latif:router-sud"]);
});
```

- [ ] **Step 2: Run the recovery test and verify RED**

Run: `npm test -- --test-name-pattern='router recovers'`

Expected: FAIL because no pending-binding retry service exists.

- [ ] **Step 3: Add the bounded retry service and call it on successful sync**

```ts
export async function retryPendingRoamingBindingsForRouter(routerId: string, limit = 50) {
  const pending = await loadPendingRoamingBindings(routerId, limit);
  for (const binding of pending) {
    await reconcileRoamingDeviceBinding({
      reporterRouterId: routerId,
      username: binding.username,
      mac: binding.macAddress,
      onlyRouterId: routerId,
    });
  }
}
```

After `syncRouterStats` writes `status: "online"`, call the service only when `wasOffline` is true. Keep it best-effort so router health itself cannot fail because a single roaming account is inconsistent. In `/api/cron/voucher-expiry-sync`, invoke a bounded cross-router retry after voucher expiry reconciliation; return its count in the JSON response.

- [ ] **Step 4: Run recovery and existing health-related tests**

Run: `npm test -- --test-name-pattern='router recovers|roaming|hotspot'`

Expected: PASS.

- [ ] **Step 5: Commit recovery behavior**

```bash
git add src/lib/roaming/pending-binding-retry.ts src/lib/roaming/pending-binding-retry.test.ts src/lib/mikrotik/router-sync.ts src/app/api/cron/voucher-expiry-sync/route.ts
git commit -m "feat(roaming): retry pending device bindings on recovery"
```

### Task 5: Align HotSpot cookies with the durable MAC policy

**Files:**
- Modify: `src/lib/mikrotik/hotspot-login-mode.ts`
- Modify: `src/lib/mikrotik/hotspot-login-mode.test.ts`
- Modify: `src/lib/mikrotik/voucher-profile-provision.ts`
- Modify: `src/lib/mikrotik/voucher-profile-provision.test.ts`

- [ ] **Step 1: Write the failing RouterOS setting tests**

```ts
it("sets one-year HTTP and MAC cookies without removing login methods", async () => {
  const { client, recorded } = mockClient({
    "/ip/hotspot/print": [{ ".id": "*1", profile: "NEUF", disabled: "false" }],
    "/ip/hotspot/profile/print": [{ ".id": "*P1", name: "NEUF", "login-by": "http-pap" }],
    "/ip/hotspot/user/profile/print": [{ ".id": "*U1", name: "01-JOUR", "add-mac-cookie": "false" }],
  });
  await ensureHotspotLoginByCode(client as never);
  assert.ok(recorded.some((s) => s.includes("=http-cookie-lifetime=52w1d")));
  assert.ok(recorded.some((s) => s.includes("=mac-cookie-timeout=52w1d")));
});
```

- [ ] **Step 2: Run the focused RouterOS tests and verify RED**

Run: `npm test -- --test-name-pattern='one-year HTTP and MAC cookies'`

Expected: FAIL because the long lifetimes are not reconciled in this helper.

- [ ] **Step 3: Implement additive profile convergence**

```ts
export const ROAMING_COOKIE_LIFETIME = "52w1d";

await client.talk([
  "/ip/hotspot/profile/set",
  `=numbers=${serverProfileId}`,
  `=login-by=${mergedLoginBy}`,
  `=http-cookie-lifetime=${ROAMING_COOKIE_LIFETIME}`,
]);

await client.talk([
  "/ip/hotspot/user/profile/set",
  `=numbers=${voucherProfileId}`,
  "=add-mac-cookie=yes",
  `=mac-cookie-timeout=${ROAMING_COOKIE_LIFETIME}`,
]);
```

Preserve every existing `login-by` mechanism. Keep expiry scripts and expiry comments untouched: cookie lifespan must not extend a paid voucher beyond its own rule.

- [ ] **Step 4: Run RouterOS setting regressions and verify GREEN**

Run: `npm test -- --test-name-pattern='login-by|mac-cookie|profil.*voucher|expiration'`

Expected: PASS.

- [ ] **Step 5: Commit the HotSpot configuration convergence**

```bash
git add src/lib/mikrotik/hotspot-login-mode.ts src/lib/mikrotik/hotspot-login-mode.test.ts src/lib/mikrotik/voucher-profile-provision.ts src/lib/mikrotik/voucher-profile-provision.test.ts
git commit -m "fix(roaming): retain hotspot login memory for a year"
```

### Task 6: Reconcile new zones and provide safe account controls

**Files:**
- Modify: `src/lib/roaming/provision.ts`
- Modify: `src/lib/roaming/actions.ts`
- Modify: `src/lib/roaming/mac-propagate.test.ts`
- Modify: `test/roaming-named-user.test.mjs`

- [ ] **Step 1: Write failing action and zone tests**

```js
test("les comptes roaming proposent resynchronisation et changement d'appareil", async () => {
  const actions = await read("src/lib/roaming/actions.ts");
  assert.match(actions, /export async function resyncRoamingDevice/);
  assert.match(actions, /export async function replaceRoamingDevice/);
});

test("une zone ajoutée reçoit la liaison MAC déjà mémorisée", async () => {
  const provision = await read("src/lib/roaming/provision.ts");
  assert.match(provision, /reconcileRoamingDeviceBinding/);
  assert.match(provision, /roamingDeviceBindingRouters/);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- --test-name-pattern='resynchronisation|zone ajoutée reçoit'`

Expected: FAIL because the protected actions and group-extension reconciliation do not exist.

- [ ] **Step 3: Implement the protected server actions**

```ts
export async function resyncRoamingDevice(_prev: unknown, formData: FormData) {
  const session = await requireAdminSession();
  const voucherId = String(formData.get("voucherId") ?? "");
  if (!session || !voucherId) return { error: "Compte introuvable." };
  const result = await resyncBoundRoamingDevice({ orgId: session.orgId, voucherId });
  if ("error" in result) return result;
  refreshRoamingPages();
  return { success: true, synced: result.synced, pending: result.pending };
}

export async function replaceRoamingDevice(_prev: unknown, formData: FormData) {
  const session = await requireAdminSession();
  const voucherId = String(formData.get("voucherId") ?? "");
  if (!session || !voucherId) return { error: "Compte introuvable." };
  const result = await clearRoamingDeviceBinding({ orgId: session.orgId, voucherId });
  if ("error" in result) return result;
  refreshRoamingPages();
  return { success: true };
}
```

`clearRoamingDeviceBinding` removes active sessions, companion MAC user, code MAC association and RouterOS mac-cookie entries on every reachable group zone; it only clears the database binding when every target has acknowledged removal. `extendRoamingGroup` inserts a pending per-router row for every active binding and uses the shared reconciler against the newly added router before returning success.

- [ ] **Step 4: Run focused actions and current deletion tests**

Run: `npm test -- --test-name-pattern='resynchronisation|zone ajoutée reçoit|suppression révoque|modifier et supprimer'`

Expected: PASS; deletion still refuses to hide an account if a router has not accepted revocation.

- [ ] **Step 5: Commit the account-control behavior**

```bash
git add src/lib/roaming/provision.ts src/lib/roaming/actions.ts src/lib/roaming/mac-propagate.test.ts test/roaming-named-user.test.mjs
git commit -m "feat(roaming): add device resync and replacement controls"
```

### Task 7: Surface sync health in the Roaming console

**Files:**
- Modify: `src/app/admin/roaming/page.tsx`
- Modify: `src/app/admin/roaming/RoamingConsole.tsx`
- Modify: `test/roaming-named-user.test.mjs`

- [ ] **Step 1: Write the failing UI contract test**

```js
test("la liste de comptes affiche la mémoire et la couverture de synchronisation", async () => {
  const [page, console] = await Promise.all([
    read("src/app/admin/roaming/page.tsx"),
    read("src/app/admin/roaming/RoamingConsole.tsx"),
  ]);
  assert.match(page, /roamingDeviceBindings/);
  assert.match(console, /Appareil mémorisé/);
  assert.match(console, /Resynchroniser/);
  assert.match(console, /Changer d.appareil/);
  assert.match(console, /useActionState\(resyncRoamingDevice/);
});
```

- [ ] **Step 2: Run the UI test and verify RED**

Run: `npm test -- --test-name-pattern='mémoire et la couverture'`

Expected: FAIL because no binding summary is loaded or rendered.

- [ ] **Step 3: Load serializable per-account summaries**

```ts
const namedUsers = await db
  .select({
    id: vouchers.id,
    username: vouchers.username,
    boundMac: roamingDeviceBindings.macAddress,
    bindingRouterStatus: roamingDeviceBindingRouters.status,
    bindingRouterName: routers.name,
    bindingLastError: roamingDeviceBindingRouters.lastError,
  })
  .from(vouchers)
  .leftJoin(roamingDeviceBindings, eq(roamingDeviceBindings.voucherId, vouchers.id))
  .leftJoin(roamingDeviceBindingRouters, eq(roamingDeviceBindingRouters.bindingId, roamingDeviceBindings.id))
  .leftJoin(routers, eq(routers.id, roamingDeviceBindingRouters.routerId));
```

Group the rows by voucher in `page.tsx`, pass `{ macAddress, syncedZones, totalZones, pendingZones }` to the client console, and keep `createdAt` serialized as an ISO string.

- [ ] **Step 4: Render accessible actions beside each account**

```tsx
<p className="text-xs text-ink-soft">
  {user.device?.macAddress ? "Appareil mémorisé" : "Appareil à mémoriser"}
  {user.device && ` · ${user.device.syncedZones}/${user.device.totalZones} zones prêtes`}
</p>
<form action={resyncAction}><input type="hidden" name="voucherId" value={user.id} /><button type="submit">Resynchroniser</button></form>
{user.device?.macAddress && <form action={replaceAction}><input type="hidden" name="voucherId" value={user.id} /><button type="submit">Changer d'appareil</button></form>}
```

Put the zone names and last errors in a text list next to the count. Disable no action merely because a router is offline; the result must explain pending retry. Keep delete confirmation separate and retain `aria-live` notices for each action.

- [ ] **Step 5: Run the UI contract test and verify GREEN**

Run: `npm test -- --test-name-pattern='mémoire et la couverture|résultat de modifier ou supprimer'`

Expected: PASS.

- [ ] **Step 6: Commit the operations UI**

```bash
git add src/app/admin/roaming/page.tsx src/app/admin/roaming/RoamingConsole.tsx test/roaming-named-user.test.mjs
git commit -m "feat(roaming): show device sync status per account"
```

### Task 8: Validate the full system and release safely

**Files:**
- Modify: `docs/superpowers/specs/2026-08-21-roaming-persistent-autologin-design.md`
- Create: `docs/superpowers/plans/2026-08-21-roaming-persistent-autologin.md`

- [ ] **Step 1: Run every repository quality gate**

Run: `git diff --check && npm test && npm run typecheck && npm run lint && npm run build`

Expected: zero failures. If a pre-existing unrelated failure occurs, report it distinctly and do not change unrelated code.

- [ ] **Step 2: Inspect only the intended release files**

Run: `git status --short && git diff --stat HEAD && git diff --check`

Expected: source, migration, tests and these two roaming documents are the only staged additions; preserve the pre-existing deleted presentation files and untracked branding/plan assets.

- [ ] **Step 3: Apply the additive database migration through the established production procedure**

Run: `node scripts/run-sql.mjs scripts/add-roaming-device-bindings.sql`

Expected: tables and indexes already exist or are created once, with no destructive SQL.

- [ ] **Step 4: Commit the completed feature**

```bash
git add scripts/add-roaming-device-bindings.sql src/lib/db/schema.ts src/lib/roaming src/lib/mikrotik/hotspot-login-mode.ts src/lib/mikrotik/hotspot-login-mode.test.ts src/lib/mikrotik/voucher-profile-provision.ts src/lib/mikrotik/voucher-profile-provision.test.ts src/lib/mikrotik/router-sync.ts src/app/api/cron/voucher-expiry-sync/route.ts src/app/admin/roaming/page.tsx src/app/admin/roaming/RoamingConsole.tsx test/roaming-named-user.test.mjs docs/superpowers/specs/2026-08-21-roaming-persistent-autologin-design.md docs/superpowers/plans/2026-08-21-roaming-persistent-autologin.md
git commit -m "feat(roaming): persist automatic inter-zone login"
```

- [ ] **Step 5: Verify the live account path after deployment**

1. Create or choose one non-expired named roaming account in a group with at least two online MikroTik.
2. Authenticate it once on the first zone and confirm the account shows one remembered MAC plus a synchronized-zone count.
3. Join a second selected zone with the same device and confirm it receives access without the captive login form.
4. Set one test zone offline, authenticate on an online zone, then restore the test zone and wait for its health reconciliation; confirm its state becomes synchronized.
5. Use **Changer d'appareil**, verify the prior MAC no longer auto-authenticates, then authenticate the new device once and repeat the second-zone check.

## Self-review

- **Spec coverage:** tasks 1–3 implement a unique durable binding; task 4 handles automatic recovery; task 5 aligns browser/MAC cookies while preserving expiry; task 6 covers new zones, resync and device replacement; task 7 supplies the required account-level UI; task 8 covers gates, migration and real two-zone validation.
- **Placeholder scan:** no task relies on an unspecified function contract; all new helper names, statuses, actions and migration columns are named in the plan.
- **Type consistency:** all paths use `PENDING | SYNCED | ERROR`, `voucherId`, `routerId`, `macAddress`, `resyncRoamingDevice`, `replaceRoamingDevice`, `reconcileRoamingDeviceBinding` and `retryPendingRoamingBindingsForRouter` consistently.
