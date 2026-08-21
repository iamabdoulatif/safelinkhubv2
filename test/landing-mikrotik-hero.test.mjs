import { access, readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("le hero emploie la photo réelle Chateau Pro et conserve ses faits produit", async () => {
  await access(new URL("../public/mikrotik/chato.webp", import.meta.url));
  const hero = await read("src/components/landing/Hero.tsx");

  assert.match(hero, /import Image from "next\/image"/);
  assert.match(hero, /src="\/mikrotik\/chato\.webp"/);
  assert.match(hero, /alt="Routeur MikroTik Chateau Pro géré dans SafeLinkHub"/);
  assert.match(hero, /width=\{1200\}/);
  assert.match(hero, /height=\{1200\}/);
  assert.match(hero, /preload/);
  // Les libellés ont quitté le composant pour le dictionnaire lors du passage
  // bilingue ; l'intention du test est inchangée — les quatre plaques doivent
  // toujours être là — mais elle se vérifie maintenant en deux temps : le hero
  // référence la clé, le dictionnaire porte le mot.
  const { fr } = await import("../src/lib/i18n/fr.ts");
  for (const cle of ["routers", "sessions", "trial", "mobileMoney"]) {
    assert.match(hero, new RegExp(`dict\\.hero\\.cards\\.${cle}\\b`), `plaque manquante : ${cle}`);
    assert.ok(fr.hero.cards[cle].length > 0, `libellé français vide : ${cle}`);
  }
  assert.match(hero, /stats\.routers > 0 \? nf\.format\(stats\.routers\) : undefined/);
  assert.match(hero, /stats\.sessions > 0 \? nf\.format\(stats\.sessions\) : undefined/);
  assert.match(hero, /stats\.mobileMoney\.length/);
  assert.match(hero, /stats\.mobileMoney\.join/);
  assert.match(hero, /action=\{localeHref\("\/auth\/register", locale\)\}/);
  assert.match(hero, /<VendorMarquee dict=\{dict\} \/>/);
});

test("la scène ralentit ses orbites et respecte le mouvement réduit", async () => {
  const styles = await read("src/app/globals.css");
  for (const selector of [".hero-orbit-scene", ".hero-orbit-router", ".hero-orbit-metric"]) {
    assert.ok(styles.includes(selector), `${selector} doit exister`);
  }
  for (const duration of ["26s", "38s"]) {
    assert.match(styles, new RegExp(`animation:[^;]*${duration}`), `durée manquante : ${duration}`);
  }
  assert.match(styles, /@media \(min-width: 1024px\)/);
  assert.match(styles, /\.hero-orbit-router, .hero-orbit-metric, .hero-orbit-orbiter \{/);
});

test("la scène desktop ne recouvre pas la colonne commerciale", async () => {
  const styles = await read("src/app/globals.css");
  const desktop = styles.slice(styles.indexOf("@media (min-width: 1024px)"));

  assert.match(desktop, /\.hero-layout \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
  assert.match(desktop, /\.hero-orbit-metrics \{ position: absolute; inset: 0; z-index: auto; display: block;/);
  assert.doesNotMatch(
    desktop,
    /\.hero-orbit-scene \{\s*pointer-events: none;\s*position: absolute;/,
    "la scène doit rester après le CTA dans le flux desktop",
  );
});

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
