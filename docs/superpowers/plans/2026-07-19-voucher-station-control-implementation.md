# Station de contrôle des tickets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à `/admin/vouchers` une station de contrôle avec import CSV MikHmon, reconnaissance de profils, corbeille restaurable et design jaune/noir cohérent avec SafeLinkHub.

**Architecture:** Le parsing CSV et la normalisation de profil restent des modules TypeScript purs, utilisables par l'aperçu navigateur et revérifiés dans les Server Actions. La corbeille est un archivage par `deletedAt` : elle ne touche jamais RouterOS. Les composants clients restent limités à l'interaction, tandis que le chargement et les contrôles d'organisation restent côté serveur.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Drizzle ORM avec Neon HTTP, Server Actions, `node:test` via `tsx`.

---

## Structure des fichiers

- `src/lib/vouchers/expiry.ts` — normalisation sûre des noms de profils MikHmon et déduction de durée réutilisable.
- `src/lib/vouchers/csv-import.ts` — parsing CSV UTF-8/CSV à champs cités, validation de lignes et association profil → forfait.
- `src/lib/vouchers/csv-import.test.ts` — tests unitaires des exports MikHmon et des variantes de profil.
- `src/lib/vouchers/actions.ts` — import CSV contrôlé côté serveur, archivage et restauration restreints à l'organisation.
- `src/lib/db/schema.ts` — colonne Drizzle `vouchers.deletedAt` et index de lecture de la corbeille.
- `scripts/add-voucher-trash.sql` — migration PostgreSQL additive et idempotente de `deleted_at`.
- `src/app/admin/vouchers/page.tsx` — DTO minimal pour les tickets actifs/archivés et les compteurs de la station.
- `src/app/admin/vouchers/VoucherTable.tsx` — tableau Station de contrôle, sélection par vue, archivage/restauration et annulation immédiate.
- `src/app/admin/vouchers/ImportTicketsModal.tsx` — une modale d'import avec deux modes : scan MikHmon et fichier CSV.
- `test/voucher-station-controls.test.mjs` — garde-fous structurels qui empêchent le retour d'une suppression RouterOS dans l'archivage.

## Task 1: Normaliser les profils et analyser un export CSV MikHmon

**Files:**

- Modify: `src/lib/vouchers/expiry.ts`
- Create: `src/lib/vouchers/csv-import.ts`
- Create: `src/lib/vouchers/csv-import.test.ts`

- [ ] **Step 1: Écrire les tests unitaires en échec pour le CSV et les profils.**

```ts
// src/lib/vouchers/csv-import.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchPackageForProfile,
  parseMikhmonVoucherCsv,
} from "./csv-import";
import { durationFromProfileName } from "./expiry";

const CSV = [
  "Username,Password,Profile,Time Limit,Data Limit,Comment",
  "1jyd59,1jyd59,01-JOUR,,,vc-850-05.11.26-alima",
  "1ji997,1ji997,01-JOUR,,,\"vente, matin\"",
].join("\n");

describe("import CSV MikHmon", () => {
  it("lit l'export MikHmon et ne retourne jamais le mot de passe", () => {
    const result = parseMikhmonVoucherCsv(CSV);
    assert.equal(result.rows.length, 2);
    assert.deepEqual(result.rows[0], {
      line: 2,
      username: "1jyd59",
      profileName: "01-JOUR",
      comment: "vc-850-05.11.26-alima",
      timeLimit: null,
      dataLimit: null,
    });
    assert.equal("password" in result.rows[0], false);
    assert.equal(result.rows[1].comment, "vente, matin");
  });

  it("accepte le BOM et le séparateur point-virgule", () => {
    const result = parseMikhmonVoucherCsv(
      "\uFEFFUsername;Password;Profile;Time Limit;Data Limit;Comment\nabc;abc;1 JOUR;;;test",
    );
    assert.equal(result.delimiter, ";");
    assert.equal(result.rows[0].profileName, "1 JOUR");
  });

  it("signale les codes vides et les doublons du fichier sans les importer", () => {
    const result = parseMikhmonVoucherCsv(
      "Username,Profile\n,01-JOUR\nabc,01-JOUR\nabc,01-JOUR",
    );
    assert.equal(result.rows.length, 1);
    assert.deepEqual(result.issues.map((issue) => issue.line), [2, 4]);
  });
});

describe("profils MikHmon", () => {
  it("reconnaît les variantes de 1 jour", () => {
    assert.deepEqual(durationFromProfileName("01-JOUR"), {
      durationValue: 1,
      durationUnit: "Days",
      billingStartsOn: "Upon First Use",
    });
    assert.equal(durationFromProfileName("1 jours")?.durationUnit, "Days");
  });

  it("associe le profil normalisé au forfait de l'organisation", () => {
    const match = matchPackageForProfile("01 JOUR", [
      { id: "day", durationValue: 1, durationUnit: "Days" },
      { id: "week", durationValue: 1, durationUnit: "Weeks" },
    ]);
    assert.equal(match?.id, "day");
    assert.equal(matchPackageForProfile("99-ANS", []), undefined);
  });
});
```

- [ ] **Step 2: Exécuter le test et vérifier l'échec initial.**

Run: `npx --no-install tsx --test src/lib/vouchers/csv-import.test.ts`  
Expected: échec indiquant que `csv-import` est introuvable ou que les exports n'existent pas.

- [ ] **Step 3: Étendre la reconnaissance de durée dans `expiry.ts`.**

Ajouter une normalisation sans état et l'utiliser dans `durationFromProfileName`; ne changer ni la structure `PackageDuration`, ni la règle « Upon First Use » :

```ts
export function normalizeVoucherProfileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, "-");
}

export function durationFromProfileName(name: string | null): PackageDuration | null {
  if (!name) return null;
  const match = /^(\d+)-?([A-Z]+)$/.exec(normalizeVoucherProfileName(name));
  if (!match) return null;
  const durationValue = Number(match[1]);
  const durationUnit = PROFILE_WORD_TO_UNIT[match[2]];
  if (!durationValue || !durationUnit) return null;
  return { durationValue, durationUnit, billingStartsOn: "Upon First Use" };
}
```

- [ ] **Step 4: Créer le module pur `csv-import.ts`.**

Implémenter un petit parseur de matrice CSV RFC-4180 (guillemets doublés, retours ligne dans un champ, BOM) au lieu d'un `split(",")`. N'exporter que les champs nécessaires à SafeLinkHub :

```ts
export type CsvVoucherRow = {
  line: number;
  username: string;
  profileName: string | null;
  comment: string | null;
  timeLimit: string | null;
  dataLimit: string | null;
};

export type CsvIssue = { line: number; message: string };
export type PackageProfileOption = {
  id: string;
  durationValue: number;
  durationUnit: string;
};

export function parseMikhmonVoucherCsv(source: string): {
  delimiter: "," | ";";
  rows: CsvVoucherRow[];
  issues: CsvIssue[];
} {
  // 1. supprimer le BOM ; 2. choisir le séparateur dans l'en-tête ;
  // 3. mapper les colonnes Username/Profile/Time Limit/Data Limit/Comment ;
  // 4. supprimer les mots de passe immédiatement ; 5. écarter username vide/doublon.
}

export function matchPackageForProfile<T extends PackageProfileOption>(
  profileName: string | null,
  packages: T[],
): T | undefined {
  const duration = durationFromProfileName(profileName);
  return duration
    ? packages.find(
        (pkg) =>
          pkg.durationValue === duration.durationValue &&
          pkg.durationUnit.trim().toLowerCase() === duration.durationUnit.toLowerCase(),
      )
    : undefined;
}
```

`profileName`, `comment`, `timeLimit` et `dataLimit` doivent devenir `null` lorsqu'ils sont vides. Une colonne `Username` manquante retourne une issue globale (`line: 1`) et aucune ligne utilisable.

- [ ] **Step 5: Rejouer les tests du nouveau module et ceux de l'expiration.**

Run: `npx --no-install tsx --test src/lib/vouchers/csv-import.test.ts src/lib/vouchers/reconcile.test.ts`  
Expected: tous les scénarios passent, dont le CSV d'exemple, la virgule dans un commentaire et `01 JOUR`.

- [ ] **Step 6: Committer la couche pure.**

```bash
git add src/lib/vouchers/expiry.ts src/lib/vouchers/csv-import.ts src/lib/vouchers/csv-import.test.ts
git commit -m "feat: parse les exports CSV MikHmon"
```

## Task 2: Ajouter la corbeille et les Server Actions sécurisées

**Files:**

- Modify: `src/lib/db/schema.ts`
- Create: `scripts/add-voucher-trash.sql`
- Modify: `src/lib/vouchers/actions.ts`
- Create: `test/voucher-station-controls.test.mjs`

- [ ] **Step 1: Écrire le test de contrat de sécurité en échec.**

```js
// test/voucher-station-controls.test.mjs
import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const actions = () => readFile(new URL("../src/lib/vouchers/actions.ts", import.meta.url), "utf8");

test("l'archivage des vouchers est scoped à l'organisation et ne contacte pas RouterOS", async () => {
  const source = await actions();
  assert.match(source, /export async function archiveVouchers/);
  assert.match(source, /requireAdminSession\(\)/);
  assert.match(source, /eq\(vouchers\.orgId, session\.orgId\)/);
  assert.match(source, /deletedAt: new Date\(\)/);
  assert.doesNotMatch(source, /archiveVouchers[\s\S]*removeHotspotUser/);
});

test("la restauration ne traite que les tickets archivés de l'organisation", async () => {
  const source = await actions();
  assert.match(source, /export async function restoreVouchers/);
  assert.match(source, /isNotNull\(vouchers\.deletedAt\)/);
  assert.match(source, /set\(\{ deletedAt: null \}\)/);
});
```

- [ ] **Step 2: Vérifier l'échec du test.**

Run: `node --test test/voucher-station-controls.test.mjs`  
Expected: échec car les Server Actions d'archivage/restauration n'existent pas.

- [ ] **Step 3: Ajouter la migration et le champ Drizzle.**

Créer une migration additive, idempotente, avec l'index correspondant aux deux vues de la page :

```sql
-- scripts/add-voucher-trash.sql
alter table vouchers add column if not exists deleted_at timestamp;

create index if not exists vouchers_org_deleted_created_idx
  on vouchers (org_id, deleted_at, created_at desc);
```

Dans `vouchers` de `src/lib/db/schema.ts`, ajouter après `note` :

```ts
deletedAt: timestamp("deleted_at"),
```

Ajouter `index` à l'import `drizzle-orm/pg-core` si absent, puis déclarer le même index dans le troisième argument de `pgTable` afin de conserver schéma et migration alignés.

- [ ] **Step 4: Remplacer la suppression distante par archivage/restauration.**

Dans `src/lib/vouchers/actions.ts` :

1. importer `isNull` et `isNotNull` depuis `drizzle-orm` ;
2. supprimer `removeHotspotUser` et l'ancienne `deleteVouchers` ;
3. ajouter les deux mutations suivantes, qui sélectionnent d'abord les IDs accessibles pour un compteur exact, puis mettent à jour seulement ces IDs :

```ts
export async function archiveVouchers(ids: string[]) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };
  if (!Array.isArray(ids) || ids.length === 0) return { error: "Aucun voucher." };

  const db = getDb();
  const rows = await db
    .select({ id: vouchers.id })
    .from(vouchers)
    .where(and(inArray(vouchers.id, ids), eq(vouchers.orgId, session.orgId), isNull(vouchers.deletedAt)));
  if (rows.length === 0) return { error: "Aucun ticket actif à archiver." };

  await db
    .update(vouchers)
    .set({ deletedAt: new Date() })
    .where(and(inArray(vouchers.id, rows.map((row) => row.id)), eq(vouchers.orgId, session.orgId)));
  revalidatePath("/admin/vouchers");
  return { success: true, archived: rows.length };
}

export async function restoreVouchers(ids: string[]) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };
  if (!Array.isArray(ids) || ids.length === 0) return { error: "Aucun voucher." };

  const db = getDb();
  const rows = await db
    .select({ id: vouchers.id })
    .from(vouchers)
    .where(and(inArray(vouchers.id, ids), eq(vouchers.orgId, session.orgId), isNotNull(vouchers.deletedAt)));
  if (rows.length === 0) return { error: "Aucun ticket archivé à restaurer." };

  await db
    .update(vouchers)
    .set({ deletedAt: null })
    .where(and(inArray(vouchers.id, rows.map((row) => row.id)), eq(vouchers.orgId, session.orgId)));
  revalidatePath("/admin/vouchers");
  return { success: true, restored: rows.length };
}
```

Conserver `RouterOSClient` pour la génération de nouveaux vouchers, mais ne laisser aucune suppression RouterOS dans le chemin d'archivage.

- [ ] **Step 5: Ajouter l'import CSV côté serveur.**

Importer `parseMikhmonVoucherCsv` et `matchPackageForProfile`. Ajouter `importCsvTickets(_previousState, formData)` avec les règles suivantes : session admin obligatoire ; un seul `routerId` ; `File` nommé `voucherCsv` ; maximum `2 * 1024 * 1024` octets ; routeur validé avec `routers.orgId = session.orgId` ; lecture `await file.text()` seulement après toutes ces validations.

Le cœur de l'écriture doit suivre ce contrat :

```ts
const existing = await db
  .select({ id: vouchers.id, username: vouchers.username, deletedAt: vouchers.deletedAt })
  .from(vouchers)
  .where(inArray(vouchers.username, parsed.rows.map((row) => row.username)));

const existingByUsername = new Map(existing.map((voucher) => [voucher.username, voucher]));
const candidates = parsed.rows.filter((row) => !existingByUsername.has(row.username));
const rows = candidates.map((row) => {
  const pkg = matchPackageForProfile(row.profileName, orgPackages);
  return {
    id: randomUUID(),
    orgId: session.orgId,
    username: row.username,
    packageId: pkg?.id ?? null,
    routerId: router.id,
    profileName: row.profileName,
    status: "PROVISIONED" as const,
    useCase: "Imported CSV",
    note: row.comment,
  };
});
```

Insérer `rows` et leurs liens `voucherRouters` dans un unique `db.batch`, exactement comme la génération existante. Retourner un DTO sans mots de passe : `imported`, `alreadyTracked`, `inTrash`, `invalidRows`, `unmatchedProfiles`. Les tickets déjà archivés sont comptés dans `inTrash` et ne sont jamais réactivés automatiquement. L'import CSV ne doit appeler ni `connectToRouter`, ni une API MikHmon.

Enfin, remplacer la table exacte `packageIdByProfile` de `importMikhmonTickets` par `matchPackageForProfile(scanned.profile, orgPackages)` : ainsi le scan MikHmon bénéficie des mêmes variantes de profil que le CSV.

- [ ] **Step 6: Exécuter les tests de contrat et la suite pure.**

Run: `node --test test/voucher-station-controls.test.mjs && npx --no-install tsx --test src/lib/vouchers/csv-import.test.ts src/lib/vouchers/reconcile.test.ts`  
Expected: toutes les assertions passent ; l'archivage est attesté sans opération RouterOS.

- [ ] **Step 7: Committer les données et actions.**

```bash
git add src/lib/db/schema.ts scripts/add-voucher-trash.sql src/lib/vouchers/actions.ts test/voucher-station-controls.test.mjs
git commit -m "feat: archive et importe les vouchers CSV"
```

## Task 3: Construire la page Station de contrôle et la corbeille

**Files:**

- Modify: `src/app/admin/vouchers/page.tsx`
- Modify: `src/app/admin/vouchers/VoucherTable.tsx`

- [ ] **Step 1: Faire évoluer le DTO de page sans exposer de données sensibles.**

Dans `page.tsx`, sélectionner les tickets actifs et archivés séparément avec `isNull(vouchers.deletedAt)` / `isNotNull(vouchers.deletedAt)`, toujours sous `eq(vouchers.orgId, session.orgId)`. Ajouter `deletedOn` au DTO uniquement pour la corbeille ; ne passer ni routeur complet, ni champ de mot de passe au composant client.

```ts
const [activeVouchers, trashedVouchers] = session
  ? await Promise.all([
      db.select().from(vouchers)
        .where(and(eq(vouchers.orgId, session.orgId), isNull(vouchers.deletedAt)))
        .orderBy(desc(vouchers.createdAt)),
      db.select().from(vouchers)
        .where(and(eq(vouchers.orgId, session.orgId), isNotNull(vouchers.deletedAt)))
        .orderBy(desc(vouchers.deletedAt)),
    ])
  : [[], []];

const stats = {
  active: activeRows.length,
  imported: activeRows.filter((voucher) => voucher.useCase.startsWith("Imported")).length,
  trashed: trashRows.length,
};
```

Passer `activeVouchers`, `trashedVouchers`, `stats`, `brand` et la zone d'actions à `VoucherTable`.

- [ ] **Step 2: Remplacer le tableau par la station opérationnelle.**

Dans `VoucherTable.tsx`, remplacer l'import `deleteVouchers` par `archiveVouchers` et `restoreVouchers`. Ajouter la vue locale `"active" | "trash"`, réinitialiser la sélection à chaque bascule, et conserver un message d'action lisible pour les erreurs des Server Actions.

La partie d'en-tête doit suivre cette structure visuelle :

```tsx
<section className="overflow-hidden border-2 border-ink bg-paper">
  <div className="flex flex-wrap items-end justify-between gap-5 bg-ink px-5 py-6 text-paper md:px-7">
    <div>
      <p className="text-xs font-bold tracking-[0.18em] text-brand">CONSOLE D'ACCÈS</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Station Tickets</h1>
      <p className="mt-1 text-sm text-paper/70">Pilotez, importez et retrouvez chaque accès Wi-Fi.</p>
    </div>
    {headerExtra}
  </div>
  <div className="grid grid-cols-1 divide-y border-y border-line md:grid-cols-3 md:divide-x md:divide-y-0">
    <Metric label="Tickets actifs" value={stats.active} accent="ink" />
    <Metric label="Importés" value={stats.imported} accent="brand" />
    <Metric label="Corbeille" value={stats.trashed} accent="muted" />
  </div>
</section>
```

`Metric` est une petite fonction locale de présentation. Utiliser ensuite deux boutons à état (`Tickets actifs`, `Corbeille`) ; la vue corbeille doit afficher `Archivé le` et remplacer l'icône d'archivage par « Restaurer ».

- [ ] **Step 3: Gérer les mutations et l'annulation immédiate.**

Utiliser une seule fonction de mutation client afin de toujours traiter les retours d'erreur :

```tsx
function runMutation(ids: string[], action: "archive" | "restore", marker: string) {
  setBusyId(marker);
  setActionMessage(null);
  startTransition(async () => {
    const result = action === "archive" ? await archiveVouchers(ids) : await restoreVouchers(ids);
    if ("error" in result) setActionMessage({ kind: "error", text: result.error });
    else {
      setSelected(new Set());
      setActionMessage({
        kind: "success",
        text: action === "archive" ? `${result.archived} ticket(s) archivé(s).` : `${result.restored} ticket(s) restauré(s).`,
        undoIds: action === "archive" ? ids : undefined,
      });
      router.refresh();
    }
    setBusyId(null);
  });
}
```

Dans le bandeau de succès, afficher le bouton **Annuler** seulement lorsque `undoIds` existe et le connecter à `runMutation(undoIds, "restore", "undo")`. L'archivage ne doit plus employer les textes « irréversible » ou « retiré du routeur ».

- [ ] **Step 4: Vérifier types, lint et production build.**

Run: `npm run lint && npm run build`  
Expected: lint sans erreur et build Next.js réussi ; aucun composant client n'importe `getDb`, `schema` ou un module de routeur.

- [ ] **Step 5: Committer la station.**

```bash
git add src/app/admin/vouchers/page.tsx src/app/admin/vouchers/VoucherTable.tsx
git commit -m "feat: ajoute la station de contrôle des tickets"
```

## Task 4: Unifier l'import MikHmon et CSV dans une modale soignée

**Files:**

- Modify: `src/app/admin/vouchers/ImportTicketsModal.tsx`
- Modify: `src/app/admin/vouchers/page.tsx`

- [ ] **Step 1: Ajouter les deux Server Actions au composant client.**

Importer `importCsvTickets`, `parseMikhmonVoucherCsv` et `matchPackageForProfile`, puis appeler les deux hooks sans condition :

```tsx
const [mode, setMode] = useState<"mikhmon" | "csv">("mikhmon");
const [mikhmonState, mikhmonAction, mikhmonPending] = useActionState(importMikhmonTickets, undefined);
const [csvState, csvAction, csvPending] = useActionState(importCsvTickets, undefined);
const state = mode === "csv" ? csvState : mikhmonState;
const formAction = mode === "csv" ? csvAction : mikhmonAction;
const pending = mode === "csv" ? csvPending : mikhmonPending;
```

Le prop `packages` doit contenir seulement `id`, `durationValue` et `durationUnit`. Le serveur continue à refaire l'association indépendamment de cette prévisualisation.

- [ ] **Step 2: Ajouter l'aperçu local CSV sans retenir de mot de passe.**

```tsx
async function previewCsv(file: File | null) {
  if (!file) return setCsvPreview(null);
  if (file.size > 2 * 1024 * 1024) {
    return setCsvPreview({ error: "Le fichier dépasse 2 Mo." });
  }
  const parsed = parseMikhmonVoucherCsv(await file.text());
  const unmatchedProfiles = parsed.rows.filter(
    (row) => row.profileName && !matchPackageForProfile(row.profileName, packages),
  ).length;
  setCsvPreview({
    validRows: parsed.rows.length,
    invalidRows: parsed.issues.length,
    unmatchedProfiles,
    sample: parsed.rows.slice(0, 3),
  });
}
```

Le formulaire CSV utilise exactement :

```tsx
<select name="routerId" required defaultValue="">
  <option value="" disabled>Choisir le routeur source</option>
  {routers.map((router) => <option key={router.id} value={router.id}>{router.name}</option>)}
</select>
<input
  name="voucherCsv"
  type="file"
  accept=".csv,text/csv"
  required
  onChange={(event) => void previewCsv(event.currentTarget.files?.[0] ?? null)}
/>
```

Afficher l'aperçu sous forme de compteurs et de trois lignes au maximum (`username`, `profileName`, `comment`). Ne jamais rendre `Password` ni le texte brut complet du fichier. Expliquer que le fichier adopte des comptes existants et ne contacte pas MikroTik.

- [ ] **Step 3: Donner au déclencheur et à la modale l'identité Station de contrôle.**

Le bouton d'ouverture devient l'action primaire `bg-brand text-ink`, avec l'icône `Upload`. Dans la modale, utiliser un en-tête noir, des onglets à bordure nette, une zone de dépôt crème, des badges de résultat et des icônes Lucide sobres (`Database`, `FileSpreadsheet`, `Upload`, `CheckCircle2`, `TriangleAlert`, `X`). Conserver le focus initial, la fermeture Échap et `aria-modal` déjà présents.

Les libellés à afficher sont :

- **Depuis MikHmon** — « Analyse directement les utilisateurs Hotspot du ou des routeurs cochés. »
- **Fichier CSV** — « Accepte l'export MikHmon : Username, Password, Profile, Time Limit, Data Limit, Comment. »
- **Profil non associé** — avertissement visible mais non bloquant.
- **Déjà dans la corbeille** — avertissement visible demandant une restauration manuelle.

- [ ] **Step 4: Vérifier l'interface dans un navigateur connecté.**

Run: `npm run dev`  
Then, with an admin session, open `http://localhost:3000/admin/vouchers` and verify:

1. la page affiche Station Tickets, trois métriques, Tickets actifs et Corbeille ;
2. l'import MikHmon garde les cases routeur existantes ;
3. CSV exige un seul routeur, prévisualise le fichier fourni et ne montre aucun mot de passe ;
4. un archivage disparaît des actifs, affiche Annuler et réapparaît dans la corbeille ;
5. Restaurer renvoie le ticket aux actifs sans aucun appel MikroTik.

Check the browser for a Next.js error overlay and console errors before stopping the dev server.

- [ ] **Step 5: Committer la modale d'import.**

```bash
git add src/app/admin/vouchers/ImportTicketsModal.tsx src/app/admin/vouchers/page.tsx
git commit -m "feat: unifie les imports MikHmon et CSV"
```

## Task 5: Migration, vérification finale et publication

**Files:**

- Modify: `docs/superpowers/plans/2026-07-19-voucher-station-control-implementation.md` (cocher les étapes exécutées)
- Deploy: `scripts/add-voucher-trash.sql` via le mécanisme SQL Neon documenté

- [ ] **Step 1: Exécuter la suite ciblée, lint et build depuis un arbre propre.**

Run:

```bash
npx --no-install tsx --test src/lib/vouchers/csv-import.test.ts src/lib/vouchers/reconcile.test.ts
node --test test/voucher-station-controls.test.mjs
npm run lint
npm run build
```

Expected: chaque commande se termine avec le code `0`.

- [ ] **Step 2: Appliquer la migration additive avant le nouveau conteneur.**

Run: `node --env-file=.env.local scripts/run-sql.mjs scripts/add-voucher-trash.sql`  
Expected: `✅ Migration appliquée.` ; la commande est réexécutable sans erreur grâce à `if not exists`.

- [ ] **Step 3: Déployer avec le script de production SafeLinkHub.**

Copier uniquement les fichiers modifiés vers le staging du VPS puis appeler le script canonique `/root/deploy-slh.sh`. Ne pas reconstruire manuellement un conteneur : ce script préserve les labels Traefik, l'environnement de production et réalise le rollback en cas d'échec.

- [ ] **Step 4: Vérifier le flux déployé.**

Avec un compte administrateur : importer le CSV de référence sur un routeur de test, vérifier l'association de `01-JOUR`, archiver puis restaurer un ticket importé. Vérifier dans les journaux applicatifs qu'aucune commande `/ip/hotspot/user/remove` n'est exécutée pendant l'archivage.

- [ ] **Step 5: Committer l'état final et transmettre le résultat.**

```bash
git add docs/superpowers/plans/2026-07-19-voucher-station-control-implementation.md
git commit -m "docs: termine le plan station tickets"
git status --short --branch
```

La transmission doit inclure le commit final, les commandes de vérification réellement exécutées, le résultat de migration et la version de conteneur déployée.
