# Dashboard Cockpit Équilibré Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recomposer le tableau de bord SafeLinkHub pour montrer au même niveau la santé du parc et les résultats commerciaux, sans modifier les règles métier ni les données visibles à une organisation.

**Architecture:** La page serveur continue de charger une seule vue agrégée par organisation. Une fonction pure construit le modèle de surveillance du parc (alerte prioritaire et courte liste), puis des composants de présentation affichent ce modèle, les KPI et les paiements récents. `DashboardPage` devient un assemblage de zones indépendantes ; `getDashboardData` reste l’unique lecture financière et routeur de la page.

**Tech Stack:** Next.js 16 App Router, React 19 Server Components, TypeScript, Drizzle ORM, Tailwind CSS v4, Node test runner via `tsx --test`.

---

## File structure

| Fichier | Responsabilité |
| --- | --- |
| `src/lib/dashboard/control-center.ts` | Modèle pur : ordre du parc, liste courte et alerte réseau. |
| `src/lib/dashboard/control-center.test.ts` | Cas de priorité et d’isolement des états du modèle pur. |
| `src/lib/dashboard/queries.ts` | Lecture organisationnelle unique ; fournit les champs routeurs au modèle sans dupliquer de requête. |
| `src/components/dashboard/DashboardAlert.tsx` | Bandeau de l’unique action prioritaire. |
| `src/components/dashboard/DashboardKpis.tsx` | Quatre cartes de synthèse homogènes et leurs liens. |
| `src/components/dashboard/FleetWatchlist.tsx` | Liste des routeurs qui nécessitent attention, ou état « parc sain ». |
| `src/components/dashboard/RecentPayments.tsx` | Liste existante de ventes récentes, extraite de la page. |
| `src/app/admin/page.tsx` | Assemblage responsive du cockpit ; conserve période, graphique et bloc Safecoin superadmin. |

### Task 1: Modèle de parc et alerte réseau purs

**Files:**
- Create: `src/lib/dashboard/control-center.ts`
- Create: `src/lib/dashboard/control-center.test.ts`

- [ ] **Step 1: Écrire les tests de priorité et de liste du parc**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFleetWatchlist, type DashboardRouter } from "./control-center";

const routers: DashboardRouter[] = [
  { id: "online", name: "SHIA-HSPT", status: "online", activeUsers: 12, lastSyncAt: new Date("2026-08-14T10:00:00.000Z") },
  { id: "offline", name: "HSPT-DIARABANA", status: "offline", activeUsers: 0, lastSyncAt: new Date("2026-08-14T09:44:00.000Z") },
  { id: "setup", name: "MAMBA-WIFI", status: "configuring", activeUsers: 0, lastSyncAt: null },
];

describe("modèle du cockpit réseau", () => {
  it("priorise un routeur hors ligne et ne montre que les trois éléments à suivre", () => {
    const result = buildFleetWatchlist(routers);
    assert.deepEqual(result.alert, {
      kind: "router-offline",
      routerId: "offline",
      routerName: "HSPT-DIARABANA",
    });
    assert.deepEqual(result.items.map((item) => item.id), ["offline", "setup"]);
  });

  it("retourne un état de parc sain lorsque tous les routeurs sont en ligne", () => {
    const result = buildFleetWatchlist([routers[0]]);
    assert.equal(result.alert, null);
    assert.deepEqual(result.items, []);
    assert.equal(result.healthyOnlineCount, 1);
  });

  it("signale l’absence de routeur avec une action d’auto-setup", () => {
    assert.deepEqual(buildFleetWatchlist([]).alert, { kind: "no-router" });
  });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npx tsx --test src/lib/dashboard/control-center.test.ts`  
Expected: FAIL because `./control-center` does not exist.

- [ ] **Step 3: Ajouter l’implémentation minimale et les types publics**

```ts
export type DashboardRouter = {
  id: string;
  name: string;
  status: string;
  activeUsers: number;
  lastSyncAt: Date | null;
};

export type FleetAlert =
  | { kind: "no-router" }
  | { kind: "router-offline"; routerId: string; routerName: string };

export function buildFleetWatchlist(routers: DashboardRouter[]) {
  const attention = routers
    .filter((router) => router.status !== "online")
    .sort((a, b) => {
      const rank = (status: string) => (status === "offline" ? 0 : 1);
      return rank(a.status) - rank(b.status) || a.name.localeCompare(b.name, "fr");
    })
    .slice(0, 3);
  const offline = attention.find((router) => router.status === "offline");

  return {
    alert: routers.length === 0
      ? { kind: "no-router" as const }
      : offline
        ? { kind: "router-offline" as const, routerId: offline.id, routerName: offline.name }
        : null,
    items: attention,
    healthyOnlineCount: routers.filter((router) => router.status === "online").length,
  };
}
```

- [ ] **Step 4: Rejouer les tests du modèle**

Run: `npx tsx --test src/lib/dashboard/control-center.test.ts`  
Expected: PASS with 3 tests.

- [ ] **Step 5: Committer le modèle isolé**

```bash
git add src/lib/dashboard/control-center.ts src/lib/dashboard/control-center.test.ts
git commit -m "feat(dashboard): model fleet watchlist"
```

### Task 2: Étendre l’agrégat de tableau de bord sans requête additionnelle

**Files:**
- Modify: `src/lib/dashboard/queries.ts:1-119`
- Modify: `src/lib/dashboard/control-center.test.ts`

- [ ] **Step 1: Ajouter un test de contrat sur le statut non standard**

```ts
it("classe un statut de configuration après un incident hors ligne", () => {
  const result = buildFleetWatchlist([
    { id: "a", name: "Zeta", status: "configuring", activeUsers: 0, lastSyncAt: null },
    { id: "b", name: "Alpha", status: "offline", activeUsers: 0, lastSyncAt: null },
  ]);
  assert.deepEqual(result.items.map((item) => item.id), ["b", "a"]);
});
```

- [ ] **Step 2: Vérifier le test de contrat**

Run: `npx tsx --test src/lib/dashboard/control-center.test.ts`  
Expected: PASS; la règle `offline` avant tout autre statut non `online` est déjà définie.

- [ ] **Step 3: Sélectionner les champs routeurs nécessaires et construire `fleet` dans `getDashboardData`**

```ts
import { buildFleetWatchlist } from "./control-center";

// Dans la requête orgRouters :
db.select({
  id: routers.id,
  name: routers.name,
  status: routers.status,
  activeUsers: routers.activeUsers,
  lastSyncAt: routers.lastSyncAt,
})

// Dans la valeur retournée :
fleet: buildFleetWatchlist(orgRouters.map((router) => ({
  ...router,
  activeUsers: router.activeUsers ?? 0,
}))),
```

Conserver les compteurs `routersOnline` et `activeUsers` existants, calculés à partir de la même collection. Ne pas sélectionner `host`, `username`, mots de passe, tunnel ou ports relay.

- [ ] **Step 4: Vérifier types et tests de la page affectée**

Run: `npm run typecheck && npm test -- --test-name-pattern="cockpit réseau"`  
Expected: PASS; TypeScript accepte le nouveau champ `fleet` et le test pur est vert.

- [ ] **Step 5: Committer l’extension de lecture**

```bash
git add src/lib/dashboard/queries.ts src/lib/dashboard/control-center.test.ts
git commit -m "feat(dashboard): expose fleet health summary"
```

### Task 3: Créer les composants de présentation du cockpit

**Files:**
- Create: `src/components/dashboard/DashboardAlert.tsx`
- Create: `src/components/dashboard/DashboardKpis.tsx`
- Create: `src/components/dashboard/FleetWatchlist.tsx`
- Create: `src/components/dashboard/RecentPayments.tsx`

- [ ] **Step 1: Écrire le test de sortie du composant de parc via une fonction de présentation pure**

Ajouter à `src/lib/dashboard/control-center.test.ts` :

```ts
import { fleetWatchlistCopy } from "./control-center";

it("produit le libellé positif sans inventer un incident", () => {
  assert.equal(fleetWatchlistCopy({ alert: null, items: [], healthyOnlineCount: 2 }), "Parc sain · 2 routeurs en ligne");
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx tsx --test src/lib/dashboard/control-center.test.ts`  
Expected: FAIL because `fleetWatchlistCopy` is not exported.

- [ ] **Step 3: Ajouter la fonction de copie et les composants sans état**

```ts
export function fleetWatchlistCopy(fleet: { alert: FleetAlert | null; items: DashboardRouter[]; healthyOnlineCount: number }) {
  return fleet.alert === null && fleet.items.length === 0
    ? `Parc sain · ${fleet.healthyOnlineCount} routeur${fleet.healthyOnlineCount > 1 ? "s" : ""} en ligne`
    : null;
}
```

`DashboardAlert` rend `null`, le lien `/admin/settings/router-setup?new=1`, ou le lien `/admin/router/${routerId}` selon `FleetAlert`. `DashboardKpis` accepte exactement quatre objets `{ label, value, detail, href, tone? }` et rend un lien par carte. `FleetWatchlist` affiche les éléments en attention avec un texte de statut, ou la sortie de `fleetWatchlistCopy`; son lien secondaire est `/admin/router`. `RecentPayments` reçoit `RecentSale[]` et rend la liste déjà présente dans `page.tsx`, avec son état vide et le lien `/admin/sales`.

- [ ] **Step 4: Valider le composant par le test pur et le typecheck**

Run: `npx tsx --test src/lib/dashboard/control-center.test.ts && npm run typecheck`  
Expected: PASS; les composants ne demandent aucune donnée secrète et la copie du parc est couverte.

- [ ] **Step 5: Committer les composants**

```bash
git add src/components/dashboard src/lib/dashboard/control-center.ts src/lib/dashboard/control-center.test.ts
git commit -m "feat(dashboard): add cockpit presentation components"
```

### Task 4: Recomposer la page dashboard selon le cockpit équilibré

**Files:**
- Modify: `src/app/admin/page.tsx:1-311`
- Modify: `src/components/dashboard/DashboardKpis.tsx`

- [ ] **Step 1: Ajouter un test de contrat de quatre KPI stables**

Dans `src/lib/dashboard/control-center.test.ts`, définir et tester une fonction `dashboardKpiOrder` :

```ts
import { dashboardKpiOrder } from "./control-center";

it("garde une lecture équilibrée : ventes, routeurs, utilisateurs, crédit", () => {
  assert.deepEqual(dashboardKpiOrder(), ["sales", "routers", "users", "credit"]);
});
```

- [ ] **Step 2: Vérifier l’échec du nouveau test**

Run: `npx tsx --test src/lib/dashboard/control-center.test.ts`  
Expected: FAIL because `dashboardKpiOrder` is not exported.

- [ ] **Step 3: Implémenter l’ordre et assembler les zones de page**

```ts
export function dashboardKpiOrder() {
  return ["sales", "routers", "users", "credit"] as const;
}
```

Dans `DashboardPage`, conserver `DateRangePicker`, `DailyChart`, `getSafecoinReport`, `rangeLabel` et les calculs financiers existants. Construire les quatre éléments dans l’ordre de `dashboardKpiOrder`, puis rendre :

```tsx
<DashboardAlert alert={data.fleet.alert} />
<DashboardKpis items={kpiItems} />
<div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
  <section className="border-2 border-line bg-paper p-4 xl:col-span-2">
    {/* En-tête Aperçu, DailyChart et légende existants */}
  </section>
  <FleetWatchlist fleet={data.fleet} />
</div>
<div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
  <RecentPayments sales={data.recentSales} hasSales={hasSales} />
  {/* Safecoin conserve son rendu conditionnel superadmin dans cette rangée. */}
</div>
```

Appliquer `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4` aux KPI, `tabular-nums` aux valeurs, `border-2 border-line bg-paper` aux surfaces et `bg-brand text-ink` uniquement à l’accent commercial. Garder le bloc Safecoin conditionnel : il reste accessible aux superadmins, mais ne concurrence pas les informations principales.

- [ ] **Step 4: Vérifier l’assemblage complet**

Run: `npm run typecheck && npm run lint && npm test`  
Expected: PASS with les tests existants et les nouveaux tests de cockpit.

- [ ] **Step 5: Committer la refonte de page**

```bash
git add src/app/admin/page.tsx src/components/dashboard src/lib/dashboard/control-center.ts src/lib/dashboard/control-center.test.ts
git commit -m "feat(dashboard): build balanced operations cockpit"
```

### Task 5: Vérifier la production et déployer

**Files:**
- Modify: aucun fichier supplémentaire attendu

- [ ] **Step 1: Construire en mode production**

Run: `npm run build`  
Expected: PASS; Next.js 16 produit le build sans erreur de type, lint ou rendu statique invalide.

- [ ] **Step 2: Vérifier les états visuels dans le navigateur local**

Vérifier `/admin` avec : une organisation sans routeur, une avec tous les routeurs en ligne, puis une avec au moins un routeur hors ligne. À chaque état, confirmer l’ordre mobile à 375 px et desktop à 1440 px, la navigation au clavier et la destination des liens.

- [ ] **Step 3: Relever le commit de production et pousser la branche autorisée**

```bash
git status --short
git log -1 --oneline
git push origin main
```

Expected: arbre propre et commit de cockpit disponible sur le dépôt distant.

- [ ] **Step 4: Déclencher le déploiement VPS selon le pipeline existant**

Run: `git push origin main`  
Expected: le workflow de déploiement SafeLinkHub construit l’image correspondant au commit poussé et remplace le service applicatif sans modifier les services de relais VPN.

- [ ] **Step 5: Vérifier le service déployé**

Contrôler l’URL de production `/admin` après authentification et relancer `npm test` sur le commit livré. Confirmer que les KPI affichés, la vue « Parc à suivre » et la période sont cohérents avec l’organisation de test.

## Plan self-review

- **Couverture de la spécification :** l’équilibre, l’alerte unique, les quatre KPI, la liste du parc, les états vides, la préservation des paiements, la responsivité, l’accessibilité et l’isolement organisationnel sont chacun couverts par les tâches 1 à 5.
- **Cohérence :** `DashboardRouter`, `FleetAlert`, `buildFleetWatchlist`, `fleetWatchlistCopy` et `dashboardKpiOrder` sont définis avant d’être utilisés par les tâches suivantes.
- **Périmètre :** aucune télémétrie, carte géographique, écriture RouterOS ou modification de navigation globale n’est introduite.
