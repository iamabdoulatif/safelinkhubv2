# MikroTik Circular Orbit Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place the validated MikroTik circular orbit on the left of the desktop hero and retain the complete commercial conversion flow on the right.

**Architecture:** The hero keeps its server-rendered data and `next/image` asset. `OrbitMetric` gains an outer orbiting wrapper and an inner readable plaque; global styles provide synchronized CSS-only rotation, counter-rotation, depth and responsive layout. No client JavaScript, animation package or data change is introduced.

**Tech Stack:** Next.js 16.2, React 19, TypeScript, `next/image`, Tailwind utilities, scoped global CSS, Node test runner via `tsx`.

---

## Structure des fichiers

- `src/components/landing/Hero.tsx` — conserve les contenus, données et actions ; place le message à droite à partir du bureau et ajoute les enveloppes orbitantes.
- `src/app/globals.css` — remplace les dérives indépendantes par une orbite circulaire de 38 s, la contre-rotation et les repli responsive/mouvement réduit.
- `test/landing-mikrotik-hero.test.mjs` — verrouille la structure, la durée, la transparence et la disposition validée.

### Task 1: Écrire le contrat de la disposition validée

**Files:**
- Modify: `test/landing-mikrotik-hero.test.mjs:29-50`

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter ce test après les contrats existants :

```js
test("la scène adopte une orbite circulaire transparente à gauche du contenu", async () => {
  const [hero, styles] = await Promise.all([
    read("src/components/landing/Hero.tsx"),
    read("src/app/globals.css"),
  ]);

  assert.match(hero, /hero-layout/);
  assert.match(hero, /hero-orbit-orbiter/);
  assert.match(hero, /hero-orbit-track/);
  assert.match(hero, /lg:text-left/);
  assert.match(styles, /@keyframes hero-orbit-turn/);
  assert.match(styles, /@keyframes hero-orbit-counterturn/);
  assert.match(styles, /hero-orbit-turn 38s linear infinite/);
  assert.match(styles, /hero-orbit-counterturn 38s linear infinite/);
  assert.match(styles, /@media \(min-width: 1024px\)[\s\S]*\.hero-layout/);
  assert.match(styles, /\.hero-orbit-track \{[\s\S]*background: transparent/);
});
```

- [ ] **Step 2: Vérifier l’échec attendu**

Run: `npx tsx --test test/landing-mikrotik-hero.test.mjs`

Expected: échec car les classes `hero-layout`, `hero-orbit-orbiter` et les
animations circulaires de 38 s n’existent pas encore.

### Task 2: Poser la structure sémantique de l’orbite et de la grille

**Files:**
- Modify: `src/components/landing/Hero.tsx:22-148`

- [ ] **Step 1: Rendre chaque plaque orbitante mais lisible**

Remplacer la racine de `OrbitMetric` par la paire de conteneurs suivante, en
conservant sans changement ses `dt`, `dd`, `p`, valeurs et classes Tailwind :

```tsx
return (
  <div className={`hero-orbit-orbiter ${className}`}>
    <div className="hero-orbit-metric">
      {/* dt, dd et p existants */}
    </div>
  </div>
);
```

Dans `OrbitScene`, remplacer `hero-orbit-grid` par :

```tsx
<div aria-hidden="true" className="hero-orbit-track" />
```

Les quatre appels `OrbitMetric` restent dans le `dl` existant et conservent
leurs données réelles.

- [ ] **Step 2: Positionner le contenu commercial à droite au bureau**

Encadrer le bloc `hero-seq` existant et `OrbitScene` dans un nouveau
`<div className="hero-layout">`. Laisser `hero-seq` avant `OrbitScene` dans
le DOM pour que le contenu reste avant la scène sur mobile. Ajouter les classes
Tailwind `lg:mx-0 lg:max-w-xl lg:text-left` au bloc, `lg:mx-0` aux paragraphes
et formulaire centrés, puis `lg:justify-start` au conteneur du lien de démo.
La grille CSS donnera ensuite l’ordre visuel scène gauche / texte droite.

- [ ] **Step 3: Relancer le test de contrat**

Run: `npx tsx --test test/landing-mikrotik-hero.test.mjs`

Expected: le nouveau test échoue encore seulement sur les keyframes et le
layout CSS absents ; les assertions de structure passent.

### Task 3: Animer l’orbite circulaire transparente en CSS

**Files:**
- Modify: `src/app/globals.css:569-710`

- [ ] **Step 1: Remplacer le décor et les dérives actuelles**

Supprimer les règles `hero-orbit-grid` et les quatre keyframes
`hero-orbit-routers`, `hero-orbit-sessions`, `hero-orbit-trial` et
`hero-orbit-money`. Garder l’ombre et la photo du routeur, puis définir :

```css
.hero-orbit-track {
  position: absolute;
  inset: 50% auto auto 50%;
  width: min(75%, 23rem);
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border: 1px dashed rgba(18, 48, 29, 0.26);
  border-radius: 50%;
  background: transparent;
}
@keyframes hero-orbit-turn {
  from { transform: rotate(0deg) translateX(var(--hero-orbit-radius)); z-index: 0; }
  50% { z-index: 3; }
  to { transform: rotate(360deg) translateX(var(--hero-orbit-radius)); z-index: 0; }
}
@keyframes hero-orbit-counterturn {
  0%, 100% { transform: translate(-50%, -50%) rotate(0deg) scale(0.78); opacity: 0.58; }
  25% { transform: translate(-50%, -50%) rotate(-90deg) scale(0.9); opacity: 0.78; }
  50% { transform: translate(-50%, -50%) rotate(-180deg) scale(1); opacity: 1; }
  75% { transform: translate(-50%, -50%) rotate(-270deg) scale(0.9); opacity: 0.78; }
}
```

Dans le media query bureau, poser `--hero-orbit-radius`, placer chaque
`.hero-orbit-orbiter` au centre, animer son tour avec
`hero-orbit-turn 38s linear infinite`, et animer son enfant avec
`hero-orbit-counterturn 38s linear infinite`. Définir des délais de `0s`,
`-9.5s`, `-19s` et `-28.5s` sur les quatre classes de faits produit.

- [ ] **Step 2: Ajouter la grille deux colonnes et les replis**

Ajouter un `@media (min-width: 1024px)` qui définit :

```css
.hero-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: clamp(1.5rem, 4vw, 4rem);
}
.hero-layout > .hero-seq { order: 2; }
.hero-layout > .hero-orbit-scene { order: 1; margin: 0; }
```

Sous ce breakpoint, les `hero-orbit-orbiter` restent des éléments de grille,
et sous 640 px les plaques gardent deux colonnes. Dans
`prefers-reduced-motion: reduce`, annuler les deux animations, le tracé et les
positions absolues pour restituer la grille complète, sans contenu invisible.

- [ ] **Step 3: Vérifier le contrat vert**

Run: `npx tsx --test test/landing-mikrotik-hero.test.mjs`

Expected: tous les tests du fichier passent, y compris le nouveau contrat de
la composition circulaire.

### Task 4: Vérifier le rendu, intégrer et livrer au VPS

**Files:**
- Modify: `test/landing-mikrotik-hero.test.mjs`, `src/components/landing/Hero.tsx`, `src/app/globals.css`

- [ ] **Step 1: Exécuter la suite et le build**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: tests, typecheck et build réussissent ; isoler tout avertissement
eslint existant de cette modification.

- [ ] **Step 2: Inspecter les deux largeurs et le mouvement réduit**

Lancer `npm run dev -- --port 3100`, puis vérifier à 1440 px que les quatre
plaques parcourent un cercle à gauche tandis que le formulaire est à droite ;
vérifier à 390 px que texte et formulaire précèdent la scène. Ajouter
`prefers-reduced-motion: reduce` et vérifier que les quatre plaques restent
visibles sans rotation.

- [ ] **Step 3: Committer le rendu**

```bash
git add -- src/components/landing/Hero.tsx src/app/globals.css test/landing-mikrotik-hero.test.mjs
git commit -m "feat(landing): orbit MikroTik facts around router"
```

- [ ] **Step 4: Fusionner et déployer Hostinger**

Depuis le worktree principal, fusionner la branche avec `git merge --no-ff
codex/mikrotik-orbit-circular-layout`, pousser `main` vers `origin`, puis
suivre le workflow GitHub `Build & deploy (self-hosted VPS)` jusqu’à son état
`success`. Vérifier enfin `https://safelinkhub.io` et
`/mikrotik/chato.webp` avec HTTP 200.
