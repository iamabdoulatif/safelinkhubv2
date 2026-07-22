# Safecoin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter Safecoin (SC), crédit interne à taux fixe 1 SC = 100 FCFA/XOF, avec débit des services, recharge, frais, rapports et interfaces client/superadmin.

**Architecture:** Un ledger Safecoin append-only et séparé de `wallet_transactions` devient la source de vérité du nouveau crédit. Les règles de prix restent exprimées en FCFA, puis converties côté serveur en centièmes de SC ; les opérations métier utilisent des références idempotentes et des écritures inverses pour les corrections. L’interface réutilise les composants et tokens visuels SafeLinkHub, avec une carte client `/admin/billing`, une tuile dashboard et une station superadmin `/admin/safecoin`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Server Actions, Drizzle ORM/Neon, `node:test` via `tsx`, SQL de migration idempotente.

---

## Cartographie des fichiers

- Create: `src/lib/safecoin/constants.ts` — taux, unités et types d’écriture.
- Create: `src/lib/safecoin/pricing.ts` — conversion FCFA ↔ SC et tarifs dérivés.
- Create: `src/lib/safecoin/pricing.test.ts` — tests de conversion et arrondis.
- Create: `src/lib/safecoin/ledger.ts` — lecture du solde, idempotence et écritures.
- Create: `src/lib/safecoin/ledger.test.ts` — règles de ledger pures avec faux dépôt minimal.
- Create: `src/lib/safecoin/actions.ts` — Server Actions recharge, correction et export.
- Create: `src/lib/safecoin/queries.ts` — agrégats organisation et superadmin.
- Create: `src/lib/remote-access/grants.ts` — durées, portée et décision d’un pass temporaire.
- Create: `src/lib/remote-access/grants.test.ts` — expiration, révocation et portée.
- Create: `src/lib/remote-access/grant-actions.ts` — création, révocation et attribution superadmin.
- Create: `src/app/admin/remote-access/TemporaryAccessPasses.tsx` — catalogue et attribution dans l’UI superadmin.
- Create: `src/app/admin/safecoin/page.tsx` — station superadmin.
- Create: `src/app/admin/safecoin/SafecoinConsole.tsx` — filtres, tableaux et interactions client.
- Create: `src/app/admin/safecoin/SafecoinActions.tsx` — formulaires recharge/correction/règles.
- Modify: `src/lib/db/schema.ts` — tables `safecoin_settings`, `safecoin_accounts`, `safecoin_fee_rules`, `safecoin_ledger`.
- Create: `scripts/add-safecoin.sql` — migration SQL idempotente et paramètres par défaut.
- Modify: `src/lib/billing/actions.ts` — administration du quota sans casser la compatibilité FCFA.
- Modify: `src/lib/mikrotik/port-forward.ts` — débit Safecoin prioritaire puis repli FCFA explicite.
- Modify: `src/app/admin/billing/page.tsx` — carte Safecoin et historique SC.
- Create: `src/app/admin/billing/SafecoinWalletCard.tsx` — présentation client et rechargement.
- Modify: `src/app/admin/page.tsx` — tuile Safecoin pour le dashboard superadmin.
- Modify: `src/components/AdminSidebar.tsx` — lien « Safecoin » dans Superadmin.
- Modify: `src/app/api/payments/geniuspay/webhook/route.ts` — confirmation d’une recharge SC idempotente.
- Create: `src/lib/safecoin/ledger.integration.test.ts` — contrôles d’autorisation/idempotence avec DB émulée.
- Create: `scripts/add-remote-access-grants.sql` — migration idempotente des passes temporaires.
- Modify: `src/lib/billing/remote-access-authorization-service.ts` — priorité et consommation des passes temporaires.
- Modify: `src/app/admin/remote-access/page.tsx` — compte à rebours du pass attribué.

---

### Task 1: Ajouter les constantes et conversions Safecoin

**Files:**
- Create: `src/lib/safecoin/constants.ts`
- Create: `src/lib/safecoin/pricing.ts`
- Test: `src/lib/safecoin/pricing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { fcfaToScCents, scCentsToFcfa, priceScInCents } from "./pricing";

test("convertit 500 FCFA en 5 SC sans perte", () => {
  assert.equal(fcfaToScCents(500), 500);
  assert.equal(scCentsToFcfa(500), 500);
});

test("arrondit vers le haut au centième de SC", () => {
  assert.equal(fcfaToScCents(501), 501);
  assert.equal(priceScInCents(1_301), 1_301);
});

test("refuse les montants négatifs et non entiers", () => {
  assert.throws(() => fcfaToScCents(-1), /positif/);
  assert.throws(() => fcfaToScCents(1.5), /entier/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx --no-install tsx --test src/lib/safecoin/pricing.test.ts`

Expected: FAIL because `./pricing` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// constants.ts
export const SC_SCALE = 100;
export const DEFAULT_SC_RATE_FCFA = 100;
export const SC_CURRENCY = "SC" as const;
export type SafecoinEntryType =
  | "topup" | "vpn_charge" | "auto_setup_charge" | "fee"
  | "admin_credit" | "admin_debit" | "refund" | "reversal";
```

```ts
// pricing.ts
import { DEFAULT_SC_RATE_FCFA, SC_SCALE } from "./constants";

export function fcfaToScCents(fcfa: number, rate = DEFAULT_SC_RATE_FCFA) {
  if (!Number.isInteger(fcfa)) throw new Error("Le montant FCFA doit être entier.");
  if (fcfa < 0) throw new Error("Le montant FCFA doit être positif.");
  if (!Number.isInteger(rate) || rate <= 0) throw new Error("Le taux Safecoin est invalide.");
  return Math.ceil((fcfa * SC_SCALE) / rate);
}

export function scCentsToFcfa(scCents: number, rate = DEFAULT_SC_RATE_FCFA) {
  if (!Number.isInteger(scCents) || scCents < 0) throw new Error("Le montant SC est invalide.");
  return Math.round((scCents * rate) / SC_SCALE);
}

export const priceScInCents = fcfaToScCents;
export function formatSc(scCents: number) {
  return `${(scCents / SC_SCALE).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} SC`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx --no-install tsx --test src/lib/safecoin/pricing.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/safecoin/constants.ts src/lib/safecoin/pricing.ts src/lib/safecoin/pricing.test.ts
git commit -m "feat: ajouter les conversions Safecoin"
```

### Task 2: Créer le schéma et la migration du ledger

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `scripts/add-safecoin.sql`

- [ ] **Step 1: Write the migration contract test**

Créer `src/lib/safecoin/ledger.integration.test.ts` avec un test de contrat
statique qui vérifie les colonnes et contraintes critiques du SQL avant toute
connexion à Neon :

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("la migration Safecoin contient les tables et contraintes critiques", () => {
  const sql = readFileSync("scripts/add-safecoin.sql", "utf8");
  for (const token of [
    "CREATE TABLE IF NOT EXISTS safecoin_settings",
    "CREATE TABLE IF NOT EXISTS safecoin_accounts",
    "CREATE TABLE IF NOT EXISTS safecoin_ledger",
    "balance_sc_cents",
    "amount_sc_cents",
    "reference_fcfa_cents",
    "idempotency_key",
    "UNIQUE (idempotency_key)",
  ]) assert.match(sql, new RegExp(token.replace(/[()]/g, "\\$&")));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx --no-install tsx --test src/lib/safecoin/ledger.integration.test.ts`

Expected: FAIL because the migration and schema tables do not exist.

- [ ] **Step 3: Write minimal implementation**

Ajouter au schéma :

```ts
export const safecoinSettings = pgTable("safecoin_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  rateFcfaPerSc: integer("rate_fcfa_per_sc").notNull().default(100),
  rechargeFeeScCents: integer("recharge_fee_sc_cents").notNull().default(0),
  vpnFeeScCents: integer("vpn_fee_sc_cents").notNull().default(0),
  autoSetupFeeScCents: integer("auto_setup_fee_sc_cents").notNull().default(0),
  version: integer("version").notNull().default(1),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const safecoinAccounts = pgTable("safecoin_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().unique().references(() => organizations.id, { onDelete: "cascade" }),
  balanceScCents: integer("balance_sc_cents").notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const safecoinFeeRules = pgTable("safecoin_fee_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  service: text("service").notNull(),
  amountScCents: integer("amount_sc_cents").notNull().default(0),
  active: boolean("active").notNull().default(true),
  version: integer("version").notNull().default(1),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const safecoinLedger = pgTable("safecoin_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => safecoinAccounts.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  entryType: text("entry_type").notNull(),
  amountScCents: integer("amount_sc_cents").notNull(),
  referenceFcfaCents: integer("reference_fcfa_cents"),
  status: text("status").notNull().default("completed"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  referenceType: text("reference_type"),
  referenceId: text("reference_id"),
  note: text("note"),
  paymentReference: text("payment_reference"),
  paymentMethod: text("payment_method"),
  countryIso2: text("country_iso2"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("safecoin_ledger_org_created_idx").on(t.orgId, t.createdAt),
  index("safecoin_ledger_reference_idx").on(t.referenceType, t.referenceId),
]);
```

La migration crée les quatre tables, les contraintes, une ligne singleton de
paramètres avec `rate_fcfa_per_sc = 100`, puis les comptes organisationnels à
la demande (pas de faux crédit historique).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx --no-install tsx --test src/lib/safecoin/ledger.integration.test.ts`

Expected: PASS for schema/migration contract.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts scripts/add-safecoin.sql src/lib/safecoin/ledger.integration.test.ts
git commit -m "feat: ajouter le ledger Safecoin"
```

### Task 3: Implémenter le service ledger et l’idempotence

**Files:**
- Create: `src/lib/safecoin/ledger.ts`
- Test: `src/lib/safecoin/ledger.test.ts`

- [ ] **Step 1: Write the failing tests**

Ajouter quatre tests minimaux dans `src/lib/safecoin/ledger.test.ts` :

```ts
test("crée un compte à zéro", async () => {
  const account = await ensureSafecoinAccount("org-1");
  assert.equal(account.balanceScCents, 0);
});
test("une idempotencyKey ne crédite qu'une fois", async () => {
  const input = { orgId: "org-1", entryType: "topup", amountScCents: 500, idempotencyKey: "pay-1" } as const;
  await appendSafecoinCredit(input);
  const second = await appendSafecoinCredit(input);
  assert.equal(second.created, false);
});
test("refuse un débit supérieur au solde", async () => {
  const result = await appendSafecoinDebit({ orgId: "org-1", entryType: "vpn_charge", amountScCents: 501, idempotencyKey: "debit-1" });
  assert.deepEqual(result, { created: false, error: "INSUFFICIENT_BALANCE" });
});
test("inverse une écriture sans la modifier", async () => {
  const entry = await appendSafecoinCredit({ orgId: "org-1", entryType: "admin_credit", amountScCents: 100, idempotencyKey: "credit-2" });
  const reversal = await reverseSafecoinEntry(entry.entryId, "user-1", "Correction");
  assert.equal(reversal.success, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx --no-install tsx --test src/lib/safecoin/ledger.test.ts`

Expected: FAIL because the ledger service is absent.

- [ ] **Step 3: Write minimal implementation**

Exposer :

```ts
export type LedgerInput = {
  orgId: string; userId?: string; entryType: SafecoinEntryType;
  amountScCents: number; referenceFcfaCents?: number;
  idempotencyKey: string; referenceType?: string; referenceId?: string;
  note?: string; status?: "pending" | "completed" | "failed";
  paymentReference?: string; paymentMethod?: string; countryIso2?: string;
};

export async function ensureSafecoinAccount(orgId: string): Promise<{ id: string; balanceScCents: number }>;
export async function getSafecoinBalance(orgId: string): Promise<number>;
export async function appendSafecoinCredit(input: LedgerInput): Promise<{ created: boolean; entryId: string }>;
export async function appendSafecoinDebit(input: LedgerInput): Promise<{ created: boolean; entryId: string } | { created: false; error: "INSUFFICIENT_BALANCE" }>;
export async function reverseSafecoinEntry(entryId: string, userId: string, note: string): Promise<{ success: true } | { error: string }>;
```

Utiliser une écriture SQL idempotente (`onConflictDoNothing`) puis une mise à
jour conditionnelle du compte (`balance_sc_cents >= amount` pour un débit).
Les contrôles serveur ne font confiance à aucun montant fourni par le client.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx --no-install tsx --test src/lib/safecoin/ledger.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/safecoin/ledger.ts src/lib/safecoin/ledger.test.ts
git commit -m "feat: sécuriser les écritures Safecoin"
```

### Task 4: Brancher les prix VPN/Auto-Setup sur Safecoin

**Files:**
- Modify: `src/lib/mikrotik/port-forward.ts`
- Modify: `src/lib/billing/auto-setup-authorization-actions.ts`
- Modify: `src/lib/billing/auto-setup-authorization-service.ts`
- Create: `src/lib/safecoin/service-charges.ts`
- Test: `src/lib/safecoin/service-charges.test.ts`

- [ ] **Step 1: Write the failing tests**

Ajouter les assertions suivantes dans `src/lib/safecoin/service-charges.test.ts` :

```ts
test("convertit les périodes VPN existantes", () => {
  assert.deepEqual(vpnPriceScCents(), { monthly: 500, quarterly: 1300, semiannual: 2700, yearly: 5800 });
});
test("convertit l'Auto-Setup avec ou sans conteneur", () => {
  assert.equal(autoSetupPriceScCents(true), 15000);
  assert.equal(autoSetupPriceScCents(false), 10000);
});
test("un solde insuffisant ne réserve aucun débit", async () => {
  const result = await chargeVpnActivation({ orgId: "org-1", forwardId: "f-1", userId: "u-1", service: "winbox", billingPeriod: "yearly", routerName: "R1" });
  assert.equal(result.success, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx --no-install tsx --test src/lib/safecoin/service-charges.test.ts`

Expected: FAIL because the charge adapter is absent.

- [ ] **Step 3: Write minimal implementation**

Créer `chargeVpnActivation` et `chargeAutoSetup` qui calculent le prix
serveur depuis `PERIOD_PRICE_CENTS`/`autoSetupFeeCentsFor`, ajoutent le frais
de règle actif, puis appellent `appendSafecoinDebit` avec une clé stable :
`vpn:${forwardId}:period:${billingPeriod}` ou `auto-setup:${authorizationId}`.

Pour rester rétrocompatible, ajouter un paramètre de préférence de facturation
organisationnel `safecoin`/`fcfa` avec `safecoin` par défaut uniquement pour les
nouvelles activations. Une organisation sans compte SC est créée à zéro et
reçoit un message l’invitant à recharger ; elle ne reçoit aucun crédit gratuit.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx --no-install tsx --test src/lib/safecoin/service-charges.test.ts src/lib/safecoin/ledger.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/safecoin/service-charges.ts src/lib/safecoin/service-charges.test.ts src/lib/mikrotik/port-forward.ts src/lib/billing/auto-setup-authorization-actions.ts src/lib/billing/auto-setup-authorization-service.ts
git commit -m "feat: facturer les VPN et auto-setup en Safecoin"
```

### Task 5: Ajouter la recharge Safecoin et le webhook

**Files:**
- Create: `src/lib/safecoin/actions.ts`
- Modify: `src/app/api/payments/geniuspay/webhook/route.ts`
- Test: `src/lib/safecoin/actions.test.ts`

- [ ] **Step 1: Write the failing tests**

Ajouter les assertions suivantes dans `src/lib/safecoin/actions.test.ts` :

```ts
test("une recharge crée un pending et calcule le SC côté serveur", async () => {
  const result = await startSafecoinTopupPayment(form({ amount: "1000", paymentMethod: "wave", countryIso2: "CI" }));
  assert.equal(result.pendingAmountScCents, 1000);
  assert.equal(result.status, "pending");
});
test("refuse un pays non éligible", async () => {
  const result = await startSafecoinTopupPayment(form({ amount: "1000", paymentMethod: "wave", countryIso2: "XX" }));
  assert.match(result.error, /Pays/);
});
test("un webhook répété ne crédite qu'une fois", async () => {
  assert.equal(await completeSafecoinTopupByReference("ref-1"), true);
  assert.equal(await completeSafecoinTopupByReference("ref-1"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx --no-install tsx --test src/lib/safecoin/actions.test.ts`

Expected: FAIL because the actions are absent.

- [ ] **Step 3: Write minimal implementation**

Créer `startSafecoinTopupPayment`, `completeSafecoinTopupByReference` et
`addSafecoinFundsManually`. Le montant envoyé au checkout reste en FCFA ; le
montant SC est calculé depuis le taux stocké, puis conservé dans l’écriture.
Le webhook appelle la fonction SC selon `metadata.kind = "safecoin_topup"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx --no-install tsx --test src/lib/safecoin/actions.test.ts src/lib/wallet/payment-options.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/safecoin/actions.ts src/lib/safecoin/actions.test.ts src/app/api/payments/geniuspay/webhook/route.ts
git commit -m "feat: recharger Safecoin via GeniusPay"
```

### Task 6: Construire l’interface client Safecoin

**Files:**
- Create: `src/app/admin/billing/SafecoinWalletCard.tsx`
- Modify: `src/app/admin/billing/page.tsx`

- [ ] **Step 1: Write the failing UI contract test**

Créer un test de rendu minimal qui vérifie la présence de « Solde Safecoin »,
« 1 SC = 100 FCFA », « Ajouter des SC », l’équivalent FCFA et la mention
« crédit interne, non retirable ».

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/safecoin-wallet-ui.test.mjs`

Expected: FAIL because the component is absent.

- [ ] **Step 3: Write minimal implementation**

Construire une carte à contraste élevé : solde SC en grand, équivalent FCFA
en secondaire, mini-statuts de consommation VPN/Auto-Setup, bouton de recharge
et liste des dernières écritures. Réutiliser `WalletTopupModal` visuellement,
mais appeler les actions SC et garder l’ancien portefeuille FCFA dans une
section « Historique historique » séparée.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/safecoin-wallet-ui.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/billing/SafecoinWalletCard.tsx src/app/admin/billing/page.tsx test/safecoin-wallet-ui.test.mjs
git commit -m "feat: afficher le portefeuille Safecoin"
```

### Task 7: Construire la station superadmin et les rapports

**Files:**
- Create: `src/lib/safecoin/queries.ts`
- Create: `src/app/admin/safecoin/page.tsx`
- Create: `src/app/admin/safecoin/SafecoinConsole.tsx`
- Create: `src/app/admin/safecoin/SafecoinActions.tsx`
- Modify: `src/components/AdminSidebar.tsx`
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Write the failing query/UI test**

Ajouter un test d’agrégats et un test de texte de page :

```ts
test("les agrégats Safecoin exposent les KPI attendus", async () => {
  const report = await getSafecoinReport({ from: new Date("2026-07-01"), to: new Date("2026-07-31") });
  assert.deepEqual(Object.keys(report.kpis).sort(), ["activeOrganizations", "circulating", "fees", "issued", "spent"]);
  assert.equal(Array.isArray(report.daily), true);
});
```

Le test UI vérifie que le rendu contient « Station de contrôle », « SC émis »,
« SC consommés », « Frais » et « Exporter CSV ».

- [ ] **Step 2: Run test to verify it fails**

Run: `npx --no-install tsx --test src/lib/safecoin/queries.test.ts && node --test test/safecoin-console-ui.test.mjs`

Expected: FAIL because the query/page are absent.

- [ ] **Step 3: Write minimal implementation**

Ajouter les agrégats bornés par date et les Server Actions superadmin pour :
modifier le taux avec version, modifier les frais avec nouvelle règle, créditer,
débiter, inverser et exporter. La page affiche une grille dense dans le style
« Station de contrôle », un graphique SVG sans dépendance, une recherche par
organisation/email et un tableau responsive. La tuile dashboard reprend les
KPI du mois et renvoie vers `/admin/safecoin`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx --no-install tsx --test src/lib/safecoin/queries.test.ts && node --test test/safecoin-console-ui.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/safecoin/queries.ts src/app/admin/safecoin src/components/AdminSidebar.tsx src/app/admin/page.tsx
git commit -m "feat: ajouter la station de contrôle Safecoin"
```

### Task 8: Ajouter les passes d’accès distant temporaires

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `scripts/add-remote-access-grants.sql`
- Create: `src/lib/remote-access/grants.ts`
- Create: `src/lib/remote-access/grants.test.ts`
- Create: `src/lib/remote-access/grant-actions.ts`
- Create: `src/app/admin/remote-access/TemporaryAccessPasses.tsx`
- Modify: `src/lib/billing/remote-access-authorization-service.ts`
- Modify: `src/lib/mikrotik/port-forward.ts`
- Modify: `src/app/admin/remote-access/page.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
test("calcule les quatre durées de pass", () => {
  assert.deepEqual(Object.keys(TEMPORARY_ACCESS_DURATIONS), ["hour_1", "hour_2", "day_7", "day_10"]);
  assert.equal(expiresAtFor("hour_1", new Date("2026-07-22T10:00:00Z")).toISOString(), "2026-07-22T11:00:00.000Z");
});
test("un pass expiré ou révoqué ne débloque pas l’accès", async () => {
  assert.equal(await isGrantUsable({ status: "expired", expiresAt: new Date("2026-07-21") }), false);
  assert.equal(await isGrantUsable({ status: "revoked", expiresAt: new Date("2026-07-23") }), false);
});
test("la portée limite le pass au routeur et au service", () => {
  assert.equal(grantCovers({ routerId: "r1", services: ["winbox"] }, "r1", "winbox"), true);
  assert.equal(grantCovers({ routerId: "r1", services: ["winbox"] }, "r2", "winbox"), false);
  assert.equal(grantCovers({ routerId: null, services: [] }, "r2", "ssh"), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx --no-install tsx --test src/lib/remote-access/grants.test.ts`

Expected: FAIL because the temporary grant module is absent.

- [ ] **Step 3: Write minimal implementation**

Ajouter `remoteAccessGrants` avec `orgId`, `routerId` nullable, `services`
JSONB, `durationKey`, `startsAt`, `expiresAt`, `status`, `reason`, `createdBy`,
`revokedBy`, `revokedAt`, `revokeReason` et timestamps. Le service expose
`createGrant`, `findUsableGrant`, `revokeGrant`, `expireGrantIfNeeded` et
`grantCovers`. Les Server Actions exigent `isSuperAdmin`, valident les quatre
durées, le routeur de l’organisation et un motif non vide. Les passes sont
gratuits, sans tarif catalogue et sans débit Safecoin ; leur motif couvre les
promotions, parrainages, récompenses et interventions.

Modifier `evaluateRemoteAccessGate` pour chercher d’abord un pass actif de
l’organisation et du routeur ; retourner `reason: "temporary_grant"` et son
identifiant. Après une activation réussie, ne pas consommer le pass : la V1
utilise `reusable_until_expiry` pour permettre au technicien de travailler
plusieurs fois durant la fenêtre.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx --no-install tsx --test src/lib/remote-access/grants.test.ts src/lib/safecoin/service-charges.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts scripts/add-remote-access-grants.sql src/lib/remote-access src/lib/billing/remote-access-authorization-service.ts src/lib/mikrotik/port-forward.ts src/app/admin/remote-access
git commit -m "feat: ajouter les passes temporaires d acces distant"
```

### Task 9: Vérifier, migrer et préparer le déploiement

**Files:**
- Modify: `docs/superpowers/specs/2026-07-22-safecoin-design.md` uniquement si une décision validée évolue.
- No source files unless tests reveal a defect.

- [ ] **Step 1: Run focused tests**

Run: `npx --no-install tsx --test src/lib/safecoin/*.test.ts`

Expected: all Safecoin tests PASS.

- [ ] **Step 2: Run full checks**

Run: `npx --no-install tsc --noEmit && npm run lint && npm run build`

Expected: no TypeScript, lint or build errors.

- [ ] **Step 3: Apply the migration to staging/production only after build passes**

Run: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/add-safecoin.sql`

Expected: tables and default settings created; rerunning the script is safe.

- [ ] **Step 4: Verify with browser tooling**

Start the local server with `npm run dev`, then use the browser verification
flow to load `/admin/billing` and `/admin/safecoin`, check the body is not blank,
check for Next error overlays and confirm the Safecoin card, KPI cards, search,
and CSV action are visible.

- [ ] **Step 5: Commit the verification result**

```bash
git add docs/superpowers/plans/2026-07-22-safecoin-implementation.md
git commit -m "docs: planifier l implementation Safecoin"
```

## Self-review

- Spec coverage: rate, internal non-withdrawable credit, separate ledger,
  conversion, fees, recharge/webhook, temporary access passes, client wallet,
  superadmin station, reports/export, migration and security are covered by
  Tasks 1–9.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps;
  every task names files, commands and expected outcomes.
- Type consistency: all services use `amountScCents`, `referenceFcfaCents`,
  `idempotencyKey`, `entryType` and `orgId` consistently.
