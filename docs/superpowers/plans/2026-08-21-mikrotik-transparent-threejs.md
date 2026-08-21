# MikroTik transparent Three.js Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner au visuel MikroTik une scène Three.js transparente, lumineuse et profonde sans retirer l'orbite HTML accessible des quatre cartes.

**Architecture:** Extraire la scène de `Hero.tsx` dans un composant client. Le composant affiche d'abord l'image alpha de repli, puis un canvas WebGL transparent qui rend le routeur, deux anneaux à profondeurs distinctes, un halo et des particules de réseau. Les cartes restent des éléments `<dl>` HTML au-dessus de la scène.

**Tech Stack:** Next.js 16, React, TypeScript, Three.js, CSS, Node test runner.

---

### Task 1: Poser le contrat de la scène client

**Files:**
- Modify: `test/landing-mikrotik-hero.test.mjs`
- Create: `src/components/landing/MikrotikOrbitScene.tsx`

- [ ] **Step 1: Écrire le test en échec**

Ajouter un test qui lit les sources et vérifie que `Hero.tsx` importe `MikrotikOrbitScene`, que le composant client rend un canvas décoratif, conserve le `<dl>` de métriques, et déclare le repli `prefers-reduced-motion` :

```js
assert.match(heroSource, /import \{ MikrotikOrbitScene \} from "\.\/MikrotikOrbitScene"/)
assert.match(sceneSource, /"use client"/)
assert.match(sceneSource, /<canvas[^>]*aria-hidden/)
assert.match(sceneSource, /<dl className="hero-orbit-metrics">/)
assert.match(sceneSource, /prefers-reduced-motion: reduce/)
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx tsx --test test/landing-mikrotik-hero.test.mjs`

Expected: FAIL car `MikrotikOrbitScene.tsx` n'existe pas encore.

- [ ] **Step 3: Créer la frontière client minimale**

Créer `MikrotikOrbitScene.tsx` avec l'image `/mikrotik/chato.webp`, le canvas `aria-hidden`, et déplacer les quatre `OrbitMetric` existants dans son `<dl>`. Remplacer l'ancienne fonction `OrbitScene` de `Hero.tsx` par :

```tsx
<MikrotikOrbitScene stats={stats} />
```

- [ ] **Step 4: Vérifier le vert**

Run: `npx tsx --test test/landing-mikrotik-hero.test.mjs`

Expected: PASS, y compris les tests du Hero existants.

- [ ] **Step 5: Commit**

```bash
git add test/landing-mikrotik-hero.test.mjs src/components/landing/Hero.tsx src/components/landing/MikrotikOrbitScene.tsx
git commit -m "feat(landing): extract MikroTik orbit scene"
```

### Task 2: Détourer et valider l'image de production

**Files:**
- Modify: `public/mikrotik/chato.webp`

- [ ] **Step 1: Générer une version chroma**

Éditer l'image avec l'outil d'image en conservant strictement le routeur, ses antennes et son cadrage sur un fond `#ff00ff` uniforme, sans ombre, reflet, texte ni décor. Copier la sortie retenue vers `tmp/imagegen/chato-chroma.png`.

- [ ] **Step 2: Retirer le chroma et conserver l'alpha**

Run:

```bash
python "${CODEX_HOME:-$HOME/.codex}/skills/.system/imagegen/scripts/remove_chroma_key.py" \
  --input tmp/imagegen/chato-chroma.png --out public/mikrotik/chato.webp \
  --auto-key border --soft-matte --transparent-threshold 12 \
  --opaque-threshold 220 --despill --edge-contract 1
```

- [ ] **Step 3: Vérifier la transparence**

Run: `identify -format '%[channels]\n%[pixel:p{0,0}]\n' public/mikrotik/chato.webp`

Expected: canal alpha présent et coin `(0,0)` transparent, sans frange magenta.

- [ ] **Step 4: Commit**

```bash
git add public/mikrotik/chato.webp
git commit -m "feat(landing): make MikroTik hero asset transparent"
```

### Task 3: Rendre la profondeur Three.js et le repli sûr

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/components/landing/MikrotikOrbitScene.tsx`
- Modify: `src/app/globals.css`
- Modify: `test/landing-mikrotik-hero.test.mjs`

- [ ] **Step 1: Écrire le test en échec**

Étendre le test de sources avec les signatures du contrat de rendu :

```js
assert.match(sceneSource, /new THREE\.WebGLRenderer\(\{ alpha: true/)
assert.match(sceneSource, /THREE\.TorusGeometry/)
assert.match(sceneSource, /THREE\.Points/)
assert.match(sceneSource, /renderer\.setPixelRatio\(Math\.min\(window\.devicePixelRatio, 1\.5\)\)/)
assert.match(sceneSource, /cancelAnimationFrame/)
assert.match(cssSource, /\.hero-orbit-three-canvas \{[^}]*pointer-events: none/s)
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx tsx --test test/landing-mikrotik-hero.test.mjs`

Expected: FAIL car Three.js et les couches WebGL n'existent pas encore.

- [ ] **Step 3: Installer la dépendance exacte**

Run: `npm install three`

Expected: `three` est ajouté à `dependencies` et au lockfile.

- [ ] **Step 4: Implémenter le canvas transparent**

Dans `MikrotikOrbitScene.tsx`, créer dans un `useEffect` :

```ts
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
renderer.setClearColor(0x000000, 0)
```

Charger `/mikrotik/chato.webp` comme texture d'un plan central. Ajouter un halo sprite derrière ce plan, deux `THREE.TorusGeometry` aplatis à des valeurs `z` différentes et deux systèmes `THREE.Points` qui déplacent des particules cyan le long des ellipses. Utiliser une interpolation douce du pointeur pour incliner le groupe du routeur. N'animer que si l'élément est visible et si `prefers-reduced-motion` est faux ; dans tous les cas, rendre une image statique initiale.

Au nettoyage, appeler `cancelAnimationFrame`, déconnecter l'observateur, libérer texture, géométries, matériaux et `renderer.dispose()`.

- [ ] **Step 5: Ajouter les styles de composition**

Donner au canvas une position absolue transparente, `pointer-events: none`, et cacher l'image de repli uniquement après l'initialisation WebGL. Conserver les indices de profondeur des cartes HTML et annuler les animations canvas sous `prefers-reduced-motion`.

- [ ] **Step 6: Vérifier le vert ciblé**

Run: `npx tsx --test test/landing-mikrotik-hero.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/components/landing/MikrotikOrbitScene.tsx src/app/globals.css test/landing-mikrotik-hero.test.mjs
git commit -m "feat(landing): add luminous Three.js network depth"
```

### Task 4: Vérifier le rendu et livrer sur le VPS

**Files:**
- Modify: aucune modification attendue

- [ ] **Step 1: Vérifier qualité et build**

Run: `npm run typecheck && npm run lint && npm test && npm run build`

Expected: aucun échec ; l'avertissement historique `safecoinCharge` reste sans erreur.

- [ ] **Step 2: Vérifier visuellement en navigateur**

Démarrer le serveur et contrôler : canvas transparent, routeur sans rectangle blanc, animation de profondeur sur desktop, cartes lisibles, ordre mobile préservé, absence de débordement horizontal et arrêt du mouvement réduit.

- [ ] **Step 3: Intégrer et déployer**

Fusionner la branche dans `main`, pousser `main`, attendre le workflow `deploy.yml`, puis vérifier `https://safelinkhub.io` et `https://safelinkhub.io/mikrotik/chato.webp` en HTTP 200.
