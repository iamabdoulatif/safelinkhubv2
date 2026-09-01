# Registre d’exploitation des parcs clients — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer la grille mécanique des parcs clients par un registre de supervision responsive, filtrable et priorisé.

**Architecture:** La page serveur conserve la récupération Drizzle et transmet un tableau de données sérialisables à un nouveau conteneur client. Les fonctions pures de `router-portfolio.ts` agrègent la dernière synchronisation, déterminent un état unique et filtrent/trient les portefeuilles. Le conteneur client synchronise les filtres dans l’URL, puis rend une table sémantique sur tablette/bureau et une file de liens dédiée sur mobile.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Drizzle ORM, lucide-react, `node:test` exécuté avec `tsx`.

---

## Structure des fichiers

| Fichier | Action | Responsabilité |
| --- | --- | --- |
| `src/app/admin/router/router-portfolio.ts` | Modifier | Types sérialisables, agrégation de synchronisation, état, priorité, filtrage et tri purs. |
| `src/app/admin/router/router-portfolio.test.ts` | Modifier | Contrat de l’agrégation, des priorités, des filtres et du tri. |
| `src/app/admin/router/client-portfolio-query.ts` | Créer | Lecture et écriture non destructives des paramètres `clientStatus`, `clientQ`, `clientSort`. |
| `src/app/admin/router/client-portfolio-query.test.ts` | Créer | Contrat des paramètres partageables et de la conservation des paramètres existants. |
| `src/app/admin/router/ClientPortfolioRegistry.tsx` | Créer | Entrée client : état de filtre, debounce URL, synthèse, alerte, assemblage table/mobile. |
| `src/app/admin/router/ClientPortfolioSummary.tsx` | Créer | Bandeau des quatre indicateurs du portefeuille. |
| `src/app/admin/router/ClientPortfolioToolbar.tsx` | Créer | Recherche, puces d’état, tri et compteur de résultats. |
| `src/app/admin/router/ClientPortfolioTable.tsx` | Créer | Table sémantique visible à partir de 768 px. |
| `src/app/admin/router/ClientPortfolioMobileList.tsx` | Créer | File de liens visible sous 768 px. |
| `src/app/admin/router/router-portfolio-ui.test.tsx` | Modifier | Rendu du registre, des liens, des états et des variantes responsive. |
| `src/app/admin/router/page.tsx` | Modifier | Transmettre `lastSyncAt` à l’agrégat et afficher le registre au lieu de la grille. |
| `src/lib/i18n/admin/fr.ts` | Modifier | Tous les libellés français du registre, sans chaînes métier dispersées dans les composants. |
| `src/app/admin/router/ClientPortfolioGrid.tsx` | Supprimer | Ancienne grille et ses deux actions concurrentes. |

## Contrats retenus

Les valeurs URL du nouveau registre n’entrent pas en collision avec celles de `RoutersTable` :

```ts
export const clientPortfolioStatuses = [
  "all", "attention", "online", "configuring", "offline", "empty",
] as const;

export const clientPortfolioSorts = ["priority", "name", "lastSync"] as const;

export type ClientPortfolioStatus = (typeof clientPortfolioStatuses)[number];
export type ClientPortfolioSort = (typeof clientPortfolioSorts)[number];

export type ClientPortfolioFilters = {
  status: ClientPortfolioStatus;
  query: string;
  sort: ClientPortfolioSort;
};
```

Un état unique est choisi par organisation : `offline`, puis `configuring`, puis `empty`, puis `online`. « attention » filtre les deux premiers états. L’ordre par défaut est hors ligne, à configurer, vide, sain, puis nom français. `lastSyncAtMs` est le maximum des synchronisations connues de ses routeurs, ou `null` si aucune n’est connue.

## Task 1: Étendre le modèle de portefeuille par des fonctions pures

**Files:**
- Modify: `src/app/admin/router/router-portfolio.ts`
- Modify: `src/app/admin/router/router-portfolio.test.ts`

- [ ] **Step 1: Écrire les tests d’agrégation et de priorité en échec**

  Ajouter ces cas au test existant. Ils décrivent les nouveaux champs et empêchent une régression sur la priorité :

  ```ts
  import {
    buildClientPortfolios,
    filterClientPortfolios,
    getClientPortfolioStatus,
  } from "./router-portfolio";

  it("agrège la dernière synchronisation et donne priorité au hors ligne", () => {
    const [portfolio] = buildClientPortfolios({
      ownOrgId: "mine",
      organizations: [{ id: "client", name: "Alpha Réseau" }],
      memberOrgIds: ["client"],
      routers: [
        { orgId: "client", status: "online", lastSyncAt: new Date("2026-09-01T08:00:00Z") },
        { orgId: "client", status: "disconnected", lastSyncAt: new Date("2026-09-01T09:00:00Z") },
        { orgId: "client", status: "installing", lastSyncAt: null },
      ],
    });

    assert.equal(portfolio.lastSyncAtMs, Date.parse("2026-09-01T09:00:00Z"));
    assert.equal(getClientPortfolioStatus(portfolio), "offline");
  });

  it("filtre et trie sans muter les portefeuilles reçus", () => {
    const clients = [
      { id: "healthy", name: "Zéphyr", memberCount: 1, lastSyncAtMs: 50, routerCounts: { total: 1, online: 1, offline: 0, configuring: 0 } },
      { id: "empty", name: "Alpha", memberCount: 1, lastSyncAtMs: null, routerCounts: { total: 0, online: 0, offline: 0, configuring: 0 } },
      { id: "offline", name: "Bravo", memberCount: 1, lastSyncAtMs: 100, routerCounts: { total: 1, online: 0, offline: 1, configuring: 0 } },
    ];

    assert.deepEqual(
      filterClientPortfolios(clients, { status: "all", query: "", sort: "priority" }).map(({ id }) => id),
      ["offline", "empty", "healthy"],
    );
    assert.deepEqual(
      filterClientPortfolios(clients, { status: "attention", query: "", sort: "priority" }).map(({ id }) => id),
      ["offline"],
    );
    assert.deepEqual(
      filterClientPortfolios(clients, { status: "all", query: "alpha", sort: "name" }).map(({ id }) => id),
      ["empty"],
    );
  });
  ```

- [ ] **Step 2: Vérifier que les tests échouent**

  Run:

  ```bash
  npx tsx --test src/app/admin/router/router-portfolio.test.ts
  ```

  Expected: échec TypeScript car `lastSyncAt`, `lastSyncAtMs`, `getClientPortfolioStatus` et `filterClientPortfolios` ne sont pas encore définis.

- [ ] **Step 3: Implémenter l’agrégation, l’état et le tri minimal**

  Dans `router-portfolio.ts`, faire évoluer les types d’entrée et de sortie, puis ajouter les fonctions suivantes. Conserver `countRouterStatuses` et `parseRouterPortfolioScope` inchangées.

  ```ts
  export type ClientPortfolio = {
    id: string;
    name: string;
    memberCount: number;
    lastSyncAtMs: number | null;
    routerCounts: RouterStatusCounts;
  };

  export const clientPortfolioStatuses = [
    "all", "attention", "online", "configuring", "offline", "empty",
  ] as const;
  export const clientPortfolioSorts = ["priority", "name", "lastSync"] as const;

  export type ClientPortfolioStatus = (typeof clientPortfolioStatuses)[number];
  export type ClientPortfolioSort = (typeof clientPortfolioSorts)[number];
  export type ClientPortfolioFilters = {
    status: ClientPortfolioStatus;
    query: string;
    sort: ClientPortfolioSort;
  };

  export function getClientPortfolioStatus(client: ClientPortfolio): Exclude<ClientPortfolioStatus, "all" | "attention"> {
    if (client.routerCounts.offline > 0) return "offline";
    if (client.routerCounts.configuring > 0) return "configuring";
    if (client.routerCounts.total === 0) return "empty";
    return "online";
  }

  function priorityOf(client: ClientPortfolio) {
    return ({ offline: 0, configuring: 1, empty: 2, online: 3 })[getClientPortfolioStatus(client)];
  }

  export function filterClientPortfolios(
    clients: ClientPortfolio[],
    filters: ClientPortfolioFilters,
  ): ClientPortfolio[] {
    const needle = filters.query.trim().toLocaleLowerCase("fr");
    return clients
      .filter((client) => {
        const status = getClientPortfolioStatus(client);
        const matchesStatus = filters.status === "all"
          || (filters.status === "attention" && (status === "offline" || status === "configuring"))
          || status === filters.status;
        return matchesStatus && (!needle || client.name.toLocaleLowerCase("fr").includes(needle));
      })
      .toSorted((left, right) => {
        if (filters.sort === "lastSync") return (right.lastSyncAtMs ?? -1) - (left.lastSyncAtMs ?? -1) || left.name.localeCompare(right.name, "fr");
        if (filters.sort === "name") return left.name.localeCompare(right.name, "fr");
        return priorityOf(left) - priorityOf(right) || left.name.localeCompare(right.name, "fr");
      });
  }
  ```

  Pendant la construction, stocker les dates de chaque organisation dans `routersByOrganization`, calculer `Math.max(...dates)` quand au moins une date existe, et fournir `lastSyncAtMs` dans chaque portefeuille. Les entrées `routers` doivent accepter `lastSyncAt: Date | null`. Mettre à jour tous les anciens fixtures de `router-portfolio.test.ts` avec `lastSyncAt: null`, et compléter les objets attendus avec `lastSyncAtMs: null` pour préserver la vérification structurelle.

- [ ] **Step 4: Vérifier les tests ciblés**

  Run:

  ```bash
  npx tsx --test src/app/admin/router/router-portfolio.test.ts
  ```

  Expected: PASS, y compris les cas d’organisation sans routeur, d’état mixte et de tri non mutant.

- [ ] **Step 5: Committer le modèle pur**

  ```bash
  git add src/app/admin/router/router-portfolio.ts src/app/admin/router/router-portfolio.test.ts
  git commit -m "feat(routeurs): prioriser les parcs clients"
  ```

## Task 2: Rendre les filtres du registre partageables dans l’URL

**Files:**
- Create: `src/app/admin/router/client-portfolio-query.ts`
- Create: `src/app/admin/router/client-portfolio-query.test.ts`

- [ ] **Step 1: Écrire les tests d’URL en échec**

  ```ts
  import assert from "node:assert/strict";
  import { describe, it } from "node:test";
  import { buildClientPortfolioQuery, parseClientPortfolioFilters } from "./client-portfolio-query";

  describe("paramètres du registre client", () => {
    it("lit uniquement les valeurs reconnues et garde les défauts sûrs", () => {
      assert.deepEqual(
        parseClientPortfolioFilters(new URLSearchParams("clientStatus=offline&clientQ=AKR&clientSort=lastSync")),
        { status: "offline", query: "AKR", sort: "lastSync" },
      );
      assert.deepEqual(
        parseClientPortfolioFilters(new URLSearchParams("clientStatus=unknown&clientSort=random")),
        { status: "all", query: "", sort: "priority" },
      );
    });

    it("ne modifie pas scope, org ni les paramètres d’une autre vue", () => {
      const next = buildClientPortfolioQuery(
        new URLSearchParams("scope=clients&org=client-1&status=offline&q=routeur&view=metrics"),
        { status: "attention", query: "Alpha", sort: "name" },
      );
      assert.equal(next.toString(), "scope=clients&org=client-1&status=offline&q=routeur&view=metrics&clientStatus=attention&clientQ=Alpha&clientSort=name");
    });
  });
  ```

- [ ] **Step 2: Vérifier l’échec initial**

  Run:

  ```bash
  npx tsx --test src/app/admin/router/client-portfolio-query.test.ts
  ```

  Expected: FAIL avec module introuvable.

- [ ] **Step 3: Créer le contrat de paramètres**

  ```ts
  import type { ClientPortfolioFilters, ClientPortfolioSort, ClientPortfolioStatus } from "./router-portfolio";

  const statuses = new Set<ClientPortfolioStatus>(["all", "attention", "online", "configuring", "offline", "empty"]);
  const sorts = new Set<ClientPortfolioSort>(["priority", "name", "lastSync"]);
  const defaults: ClientPortfolioFilters = { status: "all", query: "", sort: "priority" };

  export function parseClientPortfolioFilters(params: URLSearchParams): ClientPortfolioFilters {
    const status = params.get("clientStatus");
    const sort = params.get("clientSort");
    return {
      status: status && statuses.has(status as ClientPortfolioStatus) ? status as ClientPortfolioStatus : defaults.status,
      query: params.get("clientQ") ?? defaults.query,
      sort: sort && sorts.has(sort as ClientPortfolioSort) ? sort as ClientPortfolioSort : defaults.sort,
    };
  }

  export function buildClientPortfolioQuery(current: { toString(): string }, filters: ClientPortfolioFilters): URLSearchParams {
    const next = new URLSearchParams(current.toString());
    next.delete("clientStatus");
    next.delete("clientQ");
    next.delete("clientSort");
    if (filters.status !== "all") next.set("clientStatus", filters.status);
    if (filters.query.trim()) next.set("clientQ", filters.query.trim());
    if (filters.sort !== "priority") next.set("clientSort", filters.sort);
    return next;
  }
  ```

- [ ] **Step 4: Vérifier les paramètres et leur isolation**

  Run:

  ```bash
  npx tsx --test src/app/admin/router/client-portfolio-query.test.ts src/app/admin/router/router-table-query.test.ts
  ```

  Expected: PASS ; la vue des routeurs individuels garde ses paramètres `status` et `q`.

- [ ] **Step 5: Committer le contrat URL**

  ```bash
  git add src/app/admin/router/client-portfolio-query.ts src/app/admin/router/client-portfolio-query.test.ts
  git commit -m "feat(routeurs): partager les filtres des parcs clients"
  ```

## Task 3: Créer la présentation sémantique du registre

**Files:**
- Create: `src/app/admin/router/ClientPortfolioSummary.tsx`
- Create: `src/app/admin/router/ClientPortfolioTable.tsx`
- Create: `src/app/admin/router/ClientPortfolioMobileList.tsx`
- Modify: `src/app/admin/router/router-portfolio-ui.test.tsx`
- Modify: `src/lib/i18n/admin/fr.ts`

- [ ] **Step 1: Remplacer les assertions de grille par les assertions de registre en échec**

  Remplacer les deux tests qui importent `ClientPortfolioGrid` par les rendus de table et de liste. Vérifier les éléments réellement attendus :

  ```tsx
  const markup = renderToStaticMarkup(
    <ClientPortfolioTable
      clients={[client]}
      t={adminFr.network.routers.clients}
      tableT={adminFr.network.routers.table}
    />,
  );

  assert.match(markup, /<table/);
  assert.match(markup, /Réseaux du Marché/);
  assert.match(markup, /Hors ligne/);
  assert.match(markup, /href="\/admin\/router\?scope=clients&amp;org=d303c/);
  assert.doesNotMatch(markup, /Ouvrir l’organisation/);
  assert.doesNotMatch(markup, /Voir les routeurs/);
  ```

  Ajouter un test de liste mobile qui vérifie le même lien, le statut textuel « En attente » pour `total: 0`, et une description `aria-label` contenant le nom de l’organisation.

- [ ] **Step 2: Vérifier l’échec de rendu**

  Run:

  ```bash
  npx tsx --test src/app/admin/router/router-portfolio-ui.test.tsx
  ```

  Expected: FAIL, car les composants de registre ne sont pas encore présents.

- [ ] **Step 3: Implémenter les trois composants de présentation**

  Ajouter d’abord les clés françaises suivantes à `adminFr.network.routers.clients`, puis garder les trois composants sans état ni accès à `next/navigation` afin qu’ils soient rendables dans les tests :

  ```ts
  clientPortfolio: "Parc client",
  organizationsTracked: "Organisations suivies",
  routersManaged: "Routeurs gérés",
  routersOnline: "Routeurs connectés",
  requiresAttention: "À traiter",
  empty: "Sans routeur",
  waiting: "En attente",
  healthy: "Tout va bien",
  statusOffline: "Hors ligne",
  statusConfiguring: "À configurer",
  openClientFleetFor: "Ouvrir le parc de {name}",
  ```

  Le résumé reçoit les clients complets et calcule ses quatre valeurs via `reduce`; table et liste reçoivent déjà une liste filtrée.

  Le squelette de ligne table est :

  ```tsx
  <tr key={client.id} className="border-b border-line-soft last:border-0">
    <td className="py-4 pr-4">
      <Link
        href={`/admin/router?scope=clients&org=${client.id}`}
        aria-label={t.openClientFleetFor.replace("{name}", client.name)}
        className="group flex items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <span aria-hidden="true" className="grid size-9 place-items-center rounded-lg bg-brand text-slate-deep"><Router className="size-4" /></span>
        <span className="min-w-0"><span className="block truncate font-bold text-ink">{client.name}</span><span className="mt-0.5 block text-xs text-ink-soft">{t.clientPortfolio}</span></span>
      </Link>
    </td>
    <td className="py-4 pr-4"><ClientPortfolioStatus client={client} t={t} /></td>
    <td className="py-4 pr-4 tabular-nums font-semibold text-ink">{client.routerCounts.total} <span className="font-normal text-ink-soft">{pluralize(client.routerCounts.total, t.router, t.routerPlural)}</span></td>
    <td className="hidden py-4 pr-4 text-sm text-ink-soft lg:table-cell">{timeAgo(client.lastSyncAtMs, tableT)}</td>
    <td className="hidden py-4 pr-2 text-sm tabular-nums text-ink lg:table-cell">{client.memberCount}</td>
    <td className="py-4 text-right"><ArrowUpRight aria-hidden="true" className="ml-auto size-4 text-ink-soft transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></td>
  </tr>
  ```

  La cellule Organisation porte l’unique lien de la table ; l’icône flèche reste décorative et les boutons secondaires disparaissent. La table est `hidden md:table` et la liste `md:hidden`. Dans la liste, chaque carte est un unique `Link` à zone tactile `min-h-11`; elle affiche nom, texte d’état, total de routeurs et dernière synchronisation. Utiliser `ClientPortfolioStatus` avec un point décoratif `aria-hidden` et un libellé textuel ; ne pas ajouter de grand aplat de couleur. Réutiliser `timeAgo` depuis `RoutersTable` pour conserver le même vocabulaire de synchronisation.

- [ ] **Step 4: Vérifier le rendu et l’accessibilité de base**

  Run:

  ```bash
  npx tsx --test src/app/admin/router/router-portfolio-ui.test.tsx
  ```

  Expected: PASS ; une seule destination de parc par organisation, aucun ancien bouton et un libellé de statut explicite dans les deux présentations.

- [ ] **Step 5: Committer les composants sans état**

  ```bash
  git add src/app/admin/router/ClientPortfolioSummary.tsx src/app/admin/router/ClientPortfolioTable.tsx src/app/admin/router/ClientPortfolioMobileList.tsx src/app/admin/router/router-portfolio-ui.test.tsx src/lib/i18n/admin/fr.ts
  git commit -m "feat(routeurs): afficher le registre de parcs clients"
  ```

## Task 4: Ajouter l’interactivité et les textes du registre

**Files:**
- Create: `src/app/admin/router/ClientPortfolioToolbar.tsx`
- Create: `src/app/admin/router/ClientPortfolioRegistry.tsx`
- Modify: `src/lib/i18n/admin/fr.ts`
- Modify: `src/app/admin/router/router-portfolio-ui.test.tsx`

- [ ] **Step 1: Écrire les assertions de l’état vide, de synthèse et de filtre**

  Ajouter au test UI les attentes suivantes, en rendant `ClientPortfolioSummary` avec un client prioritaire, `ClientPortfolioToolbar` avec des callbacks sans effet, et `ClientPortfolioTable` avec zéro client :

  ```tsx
  assert.match(summaryMarkup, /Organisations suivies/);
  assert.match(summaryMarkup, /Routeurs gérés/);
  assert.match(summaryMarkup, /À traiter/);
  assert.match(emptyMarkup, /Aucune organisation cliente disponible/);
  assert.match(emptyMarkup, /Les organisations clientes avec des membres ou des routeurs apparaîtront ici/);
  assert.match(toolbarMarkup, /Rechercher une organisation/);
  assert.match(toolbarMarkup, /Trier par/);
  ```

  Ajouter dans `client-portfolio-query.test.ts` une attente que `clientStatus=attention` et `clientQ=AKR` sont conservés par `buildClientPortfolioQuery` avec `scope=clients`.

- [ ] **Step 2: Vérifier l’échec avant l’interactivité**

  Run:

  ```bash
  npx tsx --test src/app/admin/router/router-portfolio-ui.test.tsx src/app/admin/router/client-portfolio-query.test.ts
  ```

  Expected: FAIL car `ClientPortfolioToolbar` n’est pas encore fourni.

- [ ] **Step 3: Ajouter la barre de travail et le conteneur client**

  Compléter les clés déjà ajoutées dans `adminFr.network.routers.clients` avec :

  ```ts
  search: "Rechercher une organisation…",
  sortBy: "Trier par",
  priority: "Priorité",
  sortName: "Nom",
  sortLastSync: "Dernière synchronisation",
  all: "Toutes",
  attention: "À traiter",
  viewOnlyAttention: "Voir uniquement",
  results: "{count} organisation(s)",
  ```

  `ClientPortfolioRegistry.tsx` commence par `'use client'`, reçoit uniquement `clients`, `t` et `tableT` sérialisables, puis applique cette synchronisation avec un debounce de 300 ms, comme `RoutersTable` :

  ```tsx
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [filters, setFilters] = useState(() => parseClientPortfolioFilters(new URLSearchParams(searchParams.toString())));

  useEffect(() => {
    setFilters(parseClientPortfolioFilters(new URLSearchParams(searchParams.toString())));
  }, [searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = buildClientPortfolioQuery(searchParams, filters).toString();
      if (next !== searchParams.toString()) router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [filters, pathname, router, searchParams]);

  const visibleClients = useMemo(() => filterClientPortfolios(clients, filters), [clients, filters]);
  ```

  Le champ de recherche doit mettre à jour la liste immédiatement et ne mettre à jour l’URL qu’après 300 ms. Les boutons de puce emploient `aria-pressed`; le menu de tri est un `<select>` avec un libellé visible pour ne pas dépendre d’une icône seule.

- [ ] **Step 4: Vérifier les composants et les paramètres**

  Run:

  ```bash
  npx tsx --test src/app/admin/router/router-portfolio-ui.test.tsx src/app/admin/router/client-portfolio-query.test.ts
  npm run typecheck
  ```

  Expected: PASS ; les props de composants clients sont des objets sérialisables, et le type `RouterDictionary["clients"]` contient toutes les nouvelles clés.

- [ ] **Step 5: Committer l’interactivité et les traductions**

  ```bash
  git add src/app/admin/router/ClientPortfolioToolbar.tsx src/app/admin/router/ClientPortfolioRegistry.tsx src/lib/i18n/admin/fr.ts src/app/admin/router/router-portfolio-ui.test.tsx src/app/admin/router/client-portfolio-query.test.ts
  git commit -m "feat(routeurs): filtrer le registre des parcs clients"
  ```

## Task 5: Brancher le registre à la page et retirer la grille

**Files:**
- Modify: `src/app/admin/router/page.tsx`
- Delete: `src/app/admin/router/ClientPortfolioGrid.tsx`
- Modify: `src/app/admin/router/router-portfolio-ui.test.tsx`

- [ ] **Step 1: Écrire l’assertion d’intégration de la nouvelle vue**

  Ajouter `import { readFile } from "node:fs/promises";` en tête du test, puis une assertion d’intégration qui garantit que l’arbre de la vue client utilise `ClientPortfolioRegistry`, conserve les onglets et ne contient plus l’ancien import :

  ```ts
  const pageSource = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /import \{ ClientPortfolioRegistry \} from "\.\/ClientPortfolioRegistry"/);
  assert.match(pageSource, /<ClientPortfolioRegistry clients=\{clients\}/);
  assert.doesNotMatch(pageSource, /ClientPortfolioGrid/);
  ```

- [ ] **Step 2: Vérifier l’échec de l’intégration**

  Run:

  ```bash
  npx tsx --test src/app/admin/router/router-portfolio-ui.test.tsx
  ```

  Expected: FAIL tant que la page importe encore `ClientPortfolioGrid`.

- [ ] **Step 3: Brancher le composant avec les données déjà chargées**

  Remplacer l’import de la grille dans `page.tsx` et la branche `view.kind === "client-cards"` :

  ```tsx
  import { ClientPortfolioRegistry } from "./ClientPortfolioRegistry";

  // … dans la branche client-cards
  <ClientPortfolioRegistry
    clients={clients}
    t={t.clients}
    tableT={t.table}
  />
  ```

  Dans l’appel existant à `buildClientPortfolios`, laisser passer les `routerRows` déjà sélectionnés : ils contiennent déjà `lastSyncAt`. Ne pas ajouter de requête SQL ni modifier la base. Supprimer ensuite `ClientPortfolioGrid.tsx` avec `apply_patch` et retirer ses imports de test.

- [ ] **Step 4: Vérifier toute la suite routeurs**

  Run:

  ```bash
  npx tsx --test src/app/admin/router/router-portfolio.test.ts src/app/admin/router/client-portfolio-query.test.ts src/app/admin/router/router-portfolio-ui.test.tsx src/app/admin/router/router-table-query.test.ts
  npm run typecheck
  npm run lint
  ```

  Expected: tous les tests passent, TypeScript ne signale aucune prop manquante, ESLint ne remonte aucune erreur.

- [ ] **Step 5: Committer le branchement**

  ```bash
  git add src/app/admin/router/page.tsx src/app/admin/router/router-portfolio-ui.test.tsx
  git rm src/app/admin/router/ClientPortfolioGrid.tsx
  git commit -m "refactor(routeurs): remplacer la grille client par un registre"
  ```

## Task 6: Vérifier l’expérience complète avant livraison

**Files:**
- Modify only if verification exposes a defect: le fichier de composant responsable et son test ciblé.

- [ ] **Step 1: Exécuter la vérification automatisée complète**

  Run:

  ```bash
  npm test
  npm run typecheck
  npm run lint
  npm run build
  ```

  Expected: les quatre commandes terminent avec le code 0. Toute correction suit le même cycle : test qui échoue, correctif minimal, test qui passe.

- [ ] **Step 2: Vérifier en navigateur les trois seuils de responsive**

  Lancer `npm run dev`, se connecter avec un superadministrateur, puis ouvrir `/admin/router?scope=clients`. Vérifier successivement :

  ```text
  1440 px : table complète, synthèse et alerte conditionnelle ; aucun bouton d’action doublonné.
  900 px  : table compacte ; Organisation, État, Routeurs et flèche restent lisibles.
  390 px  : aucune table horizontale ; file à une colonne, puces défilables et cible tactile >= 44 px.
  ```

  Vérifier aussi : recherche « AKR », filtre À traiter, tri Dernière synchronisation, URL mise à jour après 300 ms, retour navigateur, ouverture clavier avec Tab/Entrée, et une organisation sans routeur.

- [ ] **Step 3: Vérifier le diff puis préparer le commit de correction éventuel**

  Run:

  ```bash
  git diff --check
  git status -sb
  ```

  Expected: aucune erreur d’espacement ; aucun fichier de maquette `.superpowers/` n’est suivi par Git.

  Si une correction est nécessaire, la committer avec un message `fix(routeurs): <cause précise>` après le test ciblé vert. Sinon, ne pas créer de commit supplémentaire.
