# Carte choroplèthe mondiale des comptes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le bloc « Comptes par pays » du dashboard administrateur par une carte mondiale choroplèthe affichant le nombre de comptes et leur pourcentage, dans la charte graphique SafeLinkHub.

**Architecture:** Les données serveur restent fournies par `getAccountsByCountry()` et son type `CountryRow`. Un composant client isolé charge Leaflet et un GeoJSON mondial local à la demande, associe les propriétés ISO2 aux métriques, puis rend des aplats de couleur discrets, une légende et un résumé accessible. `DashboardView` orchestre seulement la mise en page et transmet les props.

**Tech Stack:** Next.js App Router 16, React 19, TypeScript, Leaflet 1.9, Tailwind CSS v4, GeoJSON local simplifié, tests `tsx --test`.

---

## Fichiers concernés

- Create: `src/lib/dashboard/choropleth.ts` — fonctions pures pour normaliser les ISO2, calculer les classes de couleur et formater les métriques.
- Test: `src/lib/dashboard/choropleth.test.ts` — tests unitaires des calculs sans navigateur.
- Create: `src/components/dashboard/AccountsCountryChoropleth.tsx` — composant client Leaflet, états de chargement/erreur, interactions et résumé accessible.
- Create: `public/maps/world-countries.geojson` — géométrie mondiale simplifiée avec une propriété ISO2 par pays.
- Modify: `src/app/admin/DashboardView.tsx` — remplacer le panneau de lignes par la carte et adapter la grille pour donner à la carte une largeur mondiale utile.
- Modify: `src/app/globals.css` — styles Leaflet intégrés à la charte Bitume, sans dégradés ni ombres diffuses.

## Task 1: Formaliser les calculs de la choroplèthe

**Files:**
- Create: `src/lib/dashboard/choropleth.ts`
- Test: `src/lib/dashboard/choropleth.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Tester au minimum :

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { colorBucket, countryMetrics, totalAccounts } from "./choropleth";

test("calcule le total sans perdre les comptes non renseignés", () => {
  assert.equal(totalAccounts([
    { iso2: "CI", label: "Côte d’Ivoire", flag: "🇨🇮", accounts: 42, share: 0.88 },
    { iso2: "ML", label: "Mali", flag: "🇲🇱", accounts: 1, share: 0.02 },
    { iso2: null, label: "Non renseigné", flag: "—", accounts: 5, share: 0.1 },
  ]), 48);
});

test("retourne les métriques d’un pays par ISO2 en majuscules", () => {
  const result = countryMetrics([
    { iso2: "CI", label: "Côte d’Ivoire", flag: "🇨🇮", accounts: 42, share: 0.88 },
  ], "ci");
  assert.deepEqual(result, { label: "Côte d’Ivoire", accounts: 42, share: 0.88 });
});

test("classe les volumes en cinq aplats déterministes", () => {
  assert.equal(colorBucket(0, 42), 0);
  assert.equal(colorBucket(1, 42), 1);
  assert.equal(colorBucket(42, 42), 4);
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npm test -- src/lib/dashboard/choropleth.test.ts`

Expected: échec car `choropleth.ts` n’existe pas encore.

- [ ] **Step 3: Implémenter les fonctions pures minimales**

Définir `CountryMetric`, `totalAccounts`, `countryMetrics` et `colorBucket`. Normaliser les codes avec `trim().toUpperCase()`, retourner `undefined` pour un pays inconnu et protéger le cas `maxAccounts <= 0`.

Utiliser cinq classes, pas un gradient : `0` neutre, puis `1` à `4` de faible à forte intensité. Les seuils doivent être basés sur la part du maximum (`0`, `>0`, `>=25 %`, `>=50 %`, `>=75 %`) afin que 42/1 reste lisible sans rendre la carte entièrement pâle.

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npm test -- src/lib/dashboard/choropleth.test.ts`

Expected: PASS.

- [ ] **Step 5: Committer l’unité de calcul**

```bash
git add src/lib/dashboard/choropleth.ts src/lib/dashboard/choropleth.test.ts
git commit -m "feat: add country choropleth metrics"
```

## Task 2: Ajouter la géométrie mondiale légère

**Files:**
- Create: `public/maps/world-countries.geojson`

- [ ] **Step 1: Préparer une géométrie GeoJSON simplifiée**

Ajouter une `FeatureCollection` mondiale avec des polygones simplifiés et une propriété stable `ISO_A2` pour chaque pays affichable. Exclure les propriétés inutiles, les coordonnées de haute précision et les données de population : seule la forme et l’ISO2 sont nécessaires.

- [ ] **Step 2: Vérifier le fichier avant intégration**

Run: `node -e "const fs=require('fs'); const g=JSON.parse(fs.readFileSync('public/maps/world-countries.geojson','utf8')); if(g.type!=='FeatureCollection'||!g.features.length) process.exit(1); if(g.features.some(f=>!f.properties?.ISO_A2)) process.exit(1); console.log(g.features.length)"`

Expected: un nombre de features positif et aucune erreur.

- [ ] **Step 3: Vérifier la taille de l’asset**

Run: `du -h public/maps/world-countries.geojson`

Expected: asset suffisamment compact pour rester sous 500 Ko. Le chargement est différé côté composant ; cette limite évite néanmoins un transfert inutile.

- [ ] **Step 4: Committer la géométrie**

```bash
git add public/maps/world-countries.geojson
git commit -m "feat: add lightweight world map geometry"
```

## Task 3: Construire le composant client choroplèthe

**Files:**
- Create: `src/components/dashboard/AccountsCountryChoropleth.tsx`

- [ ] **Step 1: Ajouter le composant client avec les états explicites**

Le fichier commence par `"use client"`. Il reçoit `countries: CountryRow[]` et `locale: Locale`. Il gère `loading`, `error`, `selectedIso2` et la collection Leaflet via `useRef(null)` avec un type initial explicite.

- [ ] **Step 2: Charger Leaflet et le GeoJSON uniquement au montage**

Importer Leaflet dynamiquement dans `useEffect`, charger `/maps/world-countries.geojson` avec `fetch`, vérifier `response.ok`, puis créer la carte dans un conteneur ref. Ne jamais importer Leaflet au niveau module afin de rester compatible SSR.

- [ ] **Step 3: Appliquer la charte SafeLinkHub**

Utiliser les couleurs Bitume en cinq aplats fixes alignés sur les tokens : neutre `#D8D2C6`, puis moutarde clair, `#EAB308`, `#A16207` et anthracite chaud. Utiliser des traits fins `#FBFAF8` entre pays et un contour `#1C1917` au survol. Aucun dégradé, blur ou ombre diffuse.

- [ ] **Step 4: Ajouter les données dans les tooltips**

Pour chaque feature avec `ISO_A2`, récupérer les métriques normalisées. Le tooltip doit afficher : nom du pays, `N comptes`, et `X % du total`. Un clic doit mettre à jour une fiche persistante sous la carte pour mobile.

- [ ] **Step 5: Ajouter légende et résumé accessible**

Rendre une légende avec les cinq pastilles et leurs libellés. Sous la carte, afficher une liste courte des pays connus triés par comptes, puis une ligne « Non renseigné » si `iso2 === null`. Cette liste doit rester disponible avec `aria-label` même si l’utilisateur n’utilise pas la carte.

- [ ] **Step 6: Ajouter les états de chargement et d’erreur**

Pendant le chargement, afficher une surface `bg-clay` avec une indication textuelle. En cas d’erreur GeoJSON/Leaflet, afficher une alerte `border-err bg-err-soft` et le résumé textuel des pays afin que l’information métier reste utilisable.

- [ ] **Step 7: Nettoyer proprement Leaflet**

À la destruction, supprimer la carte et ses handlers pour éviter les erreurs « Map container is already initialized » lors des transitions ou re-rendus.

## Task 4: Intégrer la carte au dashboard

**Files:**
- Modify: `src/app/admin/DashboardView.tsx`

- [ ] **Step 1: Remplacer le panneau compact existant**

Importer `AccountsCountryChoropleth` et remplacer la liste de barres actuelle. Passer `countries` et `locale`. Ne pas changer `getAccountsByCountry()` ni les droits `superRail`.

- [ ] **Step 2: Donner une largeur utile à la carte mondiale**

Placer la carte dans une ligne `lg:col-span-3` avant la grille « paiements récents + Safecoin », afin que le ratio mondial reste lisible. Conserver le bloc Safecoin dans le rail de la section suivante et ne pas modifier ses liens ou ses valeurs.

- [ ] **Step 3: Respecter les composants et tokens existants**

Utiliser le composant `Card`, les classes `bg-paper`, `bg-clay`, `border-line`, `text-ink`, `text-ink-soft`, `bg-brand` et `text-brand-deep`. Ne pas introduire de violet, de dégradé ou de nouvelle police : la charte du site repose sur Bitume, moutarde et anthracite.

- [ ] **Step 4: Vérifier le cas vide**

Si `countries.length === 0`, ne pas rendre de carte vide : conserver l’absence actuelle du bloc superadmin. Si les pays existent mais que la géométrie échoue, le composant doit afficher le résumé de secours.

## Task 5: Ajouter les styles Leaflet compatibles avec la charte

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Ajouter uniquement les règles nécessaires**

Ajouter les styles de conteneur de carte, contrôles Leaflet et tooltips : fond `var(--ink)` ou `var(--slate-deep)`, bordures `var(--line)`, texte `var(--paper)`, accent `var(--brand)`. Préserver les contrôles utilisables au clavier et ne pas écraser les styles globaux de bouton.

- [ ] **Step 2: Vérifier mobile et réduction de mouvement**

Ajouter une hauteur responsive claire (`min-height` desktop, hauteur plus courte sous 640 px) et désactiver les transitions non nécessaires dans `prefers-reduced-motion: reduce`.

## Task 6: Tests et vérification finale

**Files:**
- Verify: `src/lib/dashboard/choropleth.test.ts`
- Verify: `src/app/admin/DashboardView.tsx`
- Verify: `src/components/dashboard/AccountsCountryChoropleth.tsx`

- [ ] **Step 1: Exécuter les tests ciblés**

Run: `npm test -- src/lib/dashboard/choropleth.test.ts`

Expected: PASS.

- [ ] **Step 2: Vérifier les types**

Run: `npm run typecheck`

Expected: aucune erreur TypeScript, notamment sur les types Leaflet et les props `CountryRow`.

- [ ] **Step 3: Vérifier le lint**

Run: `npm run lint`

Expected: aucune nouvelle erreur ESLint.

- [ ] **Step 4: Vérifier le build Next.js**

Run: `npm run build`

Expected: build réussi avec le composant client et l’asset public disponibles.

- [ ] **Step 5: Faire la vérification visuelle**

Rendre `DashboardView` avec les valeurs de référence : Côte d’Ivoire 42 (88 %), Mali 1 (2 %), non renseigné 5 (10 %). Vérifier desktop et mobile : carte mondiale lisible, couleurs conformes, tooltip/popup visible, résumé accessible, aucun débordement horizontal.

- [ ] **Step 6: Committer l’intégration complète**

```bash
git add src/components/dashboard/AccountsCountryChoropleth.tsx src/app/admin/DashboardView.tsx src/app/globals.css src/lib/dashboard/choropleth.ts src/lib/dashboard/choropleth.test.ts public/maps/world-countries.geojson
git commit -m "feat: replace country account panel with choropleth map"
```
