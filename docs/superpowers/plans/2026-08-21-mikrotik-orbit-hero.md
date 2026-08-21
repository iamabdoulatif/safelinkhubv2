# MikroTik Orbit Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le décor des cartes du hero par un MikroTik Chateau Pro réel en profondeur, entouré de quatre plaques de faits produit lisibles et animées lentement, sans modifier le parcours commercial existant.

**Architecture:** `Hero.tsx` conserve son bloc de texte, son formulaire, ses CTA et `VendorMarquee` à l'identique. Il reçoit une scène de présentation sans JavaScript, rendue côté serveur avec `next/image` et alimentée par le même `PlatformStats`; les règles CSS, limitées à `.hero-orbit-*`, assurent la profondeur, le responsive et le mouvement. Un test de contrat lit les sources afin de verrouiller l'image réelle, les données honnêtes et l'accessibilité mouvement réduit.

**Tech Stack:** Next.js 16.2, React 19, TypeScript, `next/image`, Tailwind pour la structure existante, CSS global scoped, Node test runner via `tsx`.

---

## Structure des fichiers

- `public/mikrotik/chato.webp` — photo réelle 1200×1200 fournie par l'utilisateur; devient l'unique visuel matériel de la scène.
- `src/components/landing/Hero.tsx` — conserve le contenu commercial existant et remplace seulement les quatre `FloatCard` décoratives par `OrbitScene` et `OrbitMetric`.
- `src/app/globals.css` — ajoute les styles `.hero-orbit-*`, les quatre trajectoires 24–32 s, le repli mobile et l'arrêt en mouvement réduit.
- `test/landing-mikrotik-hero.test.mjs` — contrat de rendu qui vérifie le fichier image, `next/image`, les quatre faits produit, les valeurs non fictives, la durée longue et la dégradation accessible.
- `test/landing-honest-figures.test.mjs` — adapte uniquement l'assertion de garde : les intitulés restent visibles, les compteurs mesurés restent absents quand la base renvoie zéro.

### Task 1: Écrire et constater le contrat de la scène

**Files:**
- Create: `test/landing-mikrotik-hero.test.mjs`
- Modify: `test/landing-honest-figures.test.mjs:25-38`

- [ ] **Step 1: Write the failing test**

Create `test/landing-mikrotik-hero.test.mjs`:

```js
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("le hero emploie la photo réelle Chateau Pro et conserve ses faits produit", async () => {
  await access(new URL("../public/mikrotik/chato.webp", import.meta.url));
  const hero = await read("src/components/landing/Hero.tsx");

  assert.match(hero, /import Image from "next\/image"/);
  assert.match(hero, /src="\/mikrotik\/chato\.webp"/);
  assert.match(hero, /alt="Routeur MikroTik Chateau Pro géré dans SafeLinkHub"/);
  assert.match(hero, /width=\{1200\}/);
  assert.match(hero, /height=\{1200\}/);
  assert.match(hero, /preload/);
  for (const label of ["Routeurs supervisés", "Sessions en cours", "Essai offert", "Mobile money"]) {
    assert.ok(hero.includes(label), "plaque manquante : " + label);
  }
  assert.match(hero, /stats\.routers > 0 \? nf\.format\(stats\.routers\) : undefined/);
  assert.match(hero, /stats\.sessions > 0 \? nf\.format\(stats\.sessions\) : undefined/);
  assert.match(hero, /stats\.mobileMoney\.length/);
  assert.match(hero, /stats\.mobileMoney\.join/);
  assert.match(hero, /action="\/auth\/register"/);
  assert.match(hero, /<VendorMarquee \/>/);
});

test("la scène ralentit ses orbites et respecte le mouvement réduit", async () => {
  const styles = await read("src/app/globals.css");
  for (const selector of [".hero-orbit-scene", ".hero-orbit-router", ".hero-orbit-metric"]) {
    assert.ok(styles.includes(selector), selector + " doit exister");
  }
  for (const duration of ["26s", "28s", "30s", "32s"]) {
    assert.match(styles, new RegExp("animation:[^;]*" + duration), "durée manquante : " + duration);
  }
  assert.match(styles, /@media \(min-width: 1280px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.hero-orbit-router/);
});
```

In `test/landing-honest-figures.test.mjs`, replace the two assertions that require a conditional card with:

```js
assert.match(hero, /stats\.routers > 0 \? nf\.format\(stats\.routers\) : undefined/);
assert.match(hero, /stats\.sessions > 0 \? nf\.format\(stats\.sessions\) : undefined/);
```

The labels remain visible, but a database fallback cannot publish “0” as a measured figure.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test test/landing-mikrotik-hero.test.mjs test/landing-honest-figures.test.mjs`

Expected: FAIL because the image, `next/image` import, and `.hero-orbit-*` rules do not yet exist in this worktree.

- [ ] **Step 3: Commit**

```bash
git add test/landing-mikrotik-hero.test.mjs test/landing-honest-figures.test.mjs
git commit -m "test(landing): define MikroTik orbit hero contract"
```

### Task 2: Ajouter l'actif source et le rendu sémantique

**Files:**
- Create: `public/mikrotik/chato.webp`
- Modify: `src/components/landing/Hero.tsx:1-112`

- [ ] **Step 1: Copier exactement l'actif fourni dans le worktree**

```bash
mkdir -p public/mikrotik
cp /Users/bambaabdoulatif/Desktop/Xenfi/public/mikrotik/chato.webp public/mikrotik/chato.webp
file public/mikrotik/chato.webp
```

Expected: `RIFF ... Web/P image ... 1200x1200`. Do not generate, retouch, or substitute this image.

- [ ] **Step 2: Replace `FloatCard` with these two components in `Hero.tsx`**

Add `import Image from "next/image";` before `Link`, remove `FloatCard`, and add before the default export:

```tsx
function OrbitMetric({
  label, value, sub, countTo, className,
}: {
  label: string;
  value?: string;
  sub: string;
  countTo?: number;
  className: string;
}) {
  return (
    <div className={"hero-orbit-metric " + className}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">{label}</dt>
      {value ? (
        <dd
          className={"mt-1 font-mono text-xl font-bold tabular-nums text-ink" + (countTo ? " countup" : "")}
          {...(countTo ? { "data-countup": String(countTo) } : {})}
        >
          {value}
        </dd>
      ) : null}
      <p className="mt-1 text-xs leading-5 text-ink-soft">{sub}</p>
    </div>
  );
}

function OrbitScene({ stats }: { stats: PlatformStats }) {
  return (
    <div className="hero-orbit-scene">
      <div aria-hidden="true" className="hero-orbit-grid" />
      <div className="hero-orbit-router">
        <div aria-hidden="true" className="hero-orbit-router-shadow" />
        <Image
          src="/mikrotik/chato.webp"
          alt="Routeur MikroTik Chateau Pro géré dans SafeLinkHub"
          width={1200}
          height={1200}
          preload
          sizes="(min-width: 1280px) 34rem, (min-width: 640px) 30rem, 92vw"
          className="hero-orbit-image"
        />
      </div>
      <dl className="hero-orbit-metrics">
        <OrbitMetric
          label="Routeurs supervisés"
          value={stats.routers > 0 ? nf.format(stats.routers) : undefined}
          countTo={stats.routers > 0 ? stats.routers : undefined}
          sub="parc total sur la plateforme"
          className="hero-orbit-metric-routers"
        />
        <OrbitMetric
          label="Sessions en cours"
          value={stats.sessions > 0 ? nf.format(stats.sessions) : undefined}
          countTo={stats.sessions > 0 ? stats.sessions : undefined}
          sub="sur les routeurs joignables"
          className="hero-orbit-metric-sessions"
        />
        <OrbitMetric
          label="Essai offert"
          value={String(VPN_TRIAL_DAYS) + " jours"}
          sub="accès distant, sans carte bancaire"
          className="hero-orbit-metric-trial"
        />
        <OrbitMetric
          label="Mobile money"
          value={String(stats.mobileMoney.length)}
          sub={stats.mobileMoney.join(" · ")}
          className="hero-orbit-metric-money"
        />
      </dl>
    </div>
  );
}
```

- [ ] **Step 3: Change only the decorative block in the default render**

Add `relative` to the existing max-width wrapper. Delete the full `aria-hidden="true"` block with the four `FloatCard` calls. Leave the eyebrow, title, description, form, plan copy, demonstration link, and `VendorMarquee` unchanged; directly after the closing `hero-seq` div, add:

```tsx
<OrbitScene stats={stats} />
```

The DOM therefore places the scene after the CTA on mobile. CSS removes it from document flow on desktop, without changing the commercial content.

- [ ] **Step 4: Run test to verify the expected CSS-only failure**

Run: `npx tsx --test test/landing-mikrotik-hero.test.mjs test/landing-honest-figures.test.mjs`

Expected: JSX and asset assertions pass; the remaining failure names absent `.hero-orbit-*` CSS or duration rules.

- [ ] **Step 5: Commit**

```bash
git add public/mikrotik/chato.webp src/components/landing/Hero.tsx
git commit -m "feat(landing): add real MikroTik hero scene"
```

### Task 3: Donner de la profondeur et des orbites lentes

**Files:**
- Modify: `src/app/globals.css:après @keyframes hero-float-in`

- [ ] **Step 1: Add the mobile-first scene styles**

Add this block after `@keyframes hero-float-in`, without changing other landing animation rules:

```css
/* ── Scène MikroTik du hero ─────────────────────────────────── */
.hero-orbit-scene {
  position: relative;
  isolation: isolate;
  width: min(100%, 38rem);
  min-height: 31rem;
  margin: 2.5rem auto 0;
  padding: 1rem 0 0;
}
.hero-orbit-grid {
  position: absolute;
  inset: 1.5rem 8% 6.5rem;
  z-index: -2;
  border: 1px solid var(--line-soft);
  border-radius: 50% 50% 18% 18%;
  opacity: 0.72;
}
.hero-orbit-router {
  position: relative;
  z-index: 1;
  width: min(84%, 29rem);
  margin: 0 auto;
  transform-style: preserve-3d;
}
.hero-orbit-router-shadow {
  position: absolute;
  right: 13%;
  bottom: 11%;
  left: 13%;
  height: 9%;
  border-radius: 50%;
  background: rgba(18, 48, 29, 0.16);
  filter: blur(14px);
  transform: translateZ(-1px);
}
.hero-orbit-image {
  position: relative;
  display: block;
  width: 100%;
  height: auto;
  mix-blend-mode: multiply;
  filter: drop-shadow(18px 24px 22px rgba(18, 48, 29, 0.17));
  transform: perspective(900px) rotateX(3deg) rotateY(-6deg);
}
.hero-orbit-metrics {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
  width: min(100%, 34rem);
  margin: -4.5rem auto 0;
}
.hero-orbit-metric {
  min-height: 6.5rem;
  padding: 0.85rem 0.9rem;
  border: 1px solid rgba(90, 98, 90, 0.28);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.76);
  box-shadow: 0 12px 24px -20px rgba(18, 48, 29, 0.5);
  transition: background-color 180ms ease, border-color 180ms ease;
}
@media (hover: hover) and (pointer: fine) {
  .hero-orbit-metric:hover {
    background: rgba(255, 255, 255, 0.92);
    border-color: rgba(18, 48, 29, 0.42);
    animation-play-state: paused;
  }
}
```

- [ ] **Step 2: Add 26–32 second desktop trajectories**

Add immediately below the preceding block:

```css
@keyframes hero-orbit-router-drift {
  0%, 100% { transform: translate3d(0, 0, 0) rotateY(-3deg); }
  50% { transform: translate3d(0, -8px, 0) rotateY(3deg); }
}
@keyframes hero-orbit-routers {
  0%, 100% { transform: translate3d(0, 0, 0) rotate(-1deg); }
  50% { transform: translate3d(10px, -9px, 0) rotate(1deg); }
}
@keyframes hero-orbit-sessions {
  0%, 100% { transform: translate3d(0, 0, 0) rotate(1deg); }
  50% { transform: translate3d(-10px, 8px, 0) rotate(-1deg); }
}
@keyframes hero-orbit-trial {
  0%, 100% { transform: translate3d(0, 0, 0) rotate(-1deg); }
  50% { transform: translate3d(-8px, 9px, 0) rotate(1deg); }
}
@keyframes hero-orbit-money {
  0%, 100% { transform: translate3d(0, 0, 0) rotate(1deg); }
  50% { transform: translate3d(9px, -8px, 0) rotate(-1deg); }
}
@media (min-width: 1280px) {
  .hero-orbit-scene {
    pointer-events: none;
    position: absolute;
    top: -0.5rem;
    right: -8.5rem;
    z-index: 1;
    width: 39rem;
    min-height: 32rem;
    margin: 0;
  }
  .hero-orbit-router { width: 31rem; animation: hero-orbit-router-drift 26s ease-in-out infinite; }
  .hero-orbit-metrics { display: block; width: auto; margin: 0; }
  .hero-orbit-metric { pointer-events: auto; position: absolute; width: 12.5rem; }
  .hero-orbit-metric-routers { top: 3%; left: -5%; animation: hero-orbit-routers 28s ease-in-out infinite; }
  .hero-orbit-metric-sessions { top: 22%; right: -7%; animation: hero-orbit-sessions 32s ease-in-out infinite; }
  .hero-orbit-metric-trial { bottom: 10%; left: 1%; animation: hero-orbit-trial 26s ease-in-out infinite; }
  .hero-orbit-metric-money { right: -3%; bottom: 3%; animation: hero-orbit-money 30s ease-in-out infinite; }
}
```

- [ ] **Step 3: Extend the existing reduced-motion rule**

In the selector list of the existing `@media (prefers-reduced-motion: reduce)` below the hero block, change it to:

```css
.reveal, .hero-seq > *, .hero-float, .hero-orbit-router, .hero-orbit-metric {
```

Then add inside that same media query:

```css
.hero-orbit-router { transform: none !important; }
```

This keeps the router and four plaques fully readable with no motion.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test test/landing-mikrotik-hero.test.mjs test/landing-honest-figures.test.mjs`

Expected: PASS with the source contract and the real-number truth rules.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(landing): animate MikroTik hero orbit"
```

### Task 4: Vérifier l'intégration Next.js et le rendu réel

**Files:**
- Verify: `src/components/landing/Hero.tsx`
- Verify: `src/app/globals.css`
- Verify: `public/mikrotik/chato.webp`

- [ ] **Step 1: Run the complete quality suite**

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: each command succeeds. Record any unrelated pre-existing warning separately; do not hide it.

- [ ] **Step 2: Verify the actual visual result locally**

```bash
npm run dev
```

At 1440 px and 390 px, verify that the title, description, e-mail capture, CTA, demo link, and vendor strip are present and readable; that the supplied Chateau Pro is neither stretched nor cropped; that plaques are transparent but legible; and that they form a two-column grid below the router at 390 px. Emulate `prefers-reduced-motion: reduce` and confirm router and plaques stop.

- [ ] **Step 3: Verify the final diff**

```bash
git diff --check
git status --short
git log --oneline -4
```

Expected: no whitespace error and only the asset, component, styles, and tests described above. This plan includes no deployment or migration.

## Auto-revue du plan

- La photo fournie est explicitement copiée, testée et protégée contre une substitution IA.
- Les quatre plaques, leurs sous-textes et la règle « pas de chiffre fictif » sont couverts par le JSX et les tests.
- Les 26, 28, 30 et 32 secondes respectent l'extension de durée demandée; le routeur est inclus dans ce tempo lent.
- Les éléments commerciaux existants sont conservés textuellement et le test verrouille le formulaire et le bandeau de compatibilité.
- Mobile, survol et mouvement réduit sont chacun prévus dans la feuille de style et dans la validation visuelle.
