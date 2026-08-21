import { access, readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("le hero emploie la photo réelle Chateau Pro et conserve ses faits produit", async () => {
  await access(new URL("../public/mikrotik/chato.webp", import.meta.url));
  const [hero, scene] = await Promise.all([
    read("src/components/landing/Hero.tsx"),
    read("src/components/landing/MikrotikOrbitScene.tsx"),
  ]);

  assert.match(hero, /import \{ MikrotikOrbitScene \} from "\.\/MikrotikOrbitScene"/);
  assert.match(hero, /<MikrotikOrbitScene stats=\{stats\} \/>/);
  assert.match(scene, /"use client"/);
  assert.match(scene, /src="\/mikrotik\/chato\.webp"/);
  assert.match(scene, /alt="Routeur MikroTik Chateau Pro géré dans SafeLinkHub"/);
  assert.match(scene, /width=\{1200\}/);
  assert.match(scene, /height=\{1200\}/);
  assert.match(scene, /preload/);
  assert.match(scene, /<canvas[^>]*aria-hidden/);
  assert.match(scene, /<dl className="hero-orbit-metrics">/);
  assert.match(scene, /prefers-reduced-motion: reduce/);
  for (const label of ["Routeurs supervisés", "Sessions en cours", "Essai offert", "Mobile money"]) {
    assert.ok(scene.includes(label), `plaque manquante : ${label}`);
  }
  assert.match(scene, /stats\.routers > 0 \? nf\.format\(stats\.routers\) : undefined/);
  assert.match(scene, /stats\.sessions > 0 \? nf\.format\(stats\.sessions\) : undefined/);
  assert.match(scene, /stats\.mobileMoney\.length/);
  assert.match(scene, /stats\.mobileMoney\.join/);
  assert.match(hero, /action="\/auth\/register"/);
  assert.match(hero, /<VendorMarquee \/>/);
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
  const [hero, scene, styles] = await Promise.all([
    read("src/components/landing/Hero.tsx"),
    read("src/components/landing/MikrotikOrbitScene.tsx"),
    read("src/app/globals.css"),
  ]);

  assert.match(hero, /hero-layout/);
  assert.match(hero, /<MikrotikOrbitScene stats=\{stats\} \/>/);
  assert.match(scene, /hero-orbit-orbiter/);
  assert.match(scene, /hero-orbit-track/);
  assert.match(hero, /lg:text-left/);
  assert.match(styles, /@keyframes hero-orbit-turn/);
  assert.match(styles, /@keyframes hero-orbit-counterturn/);
  assert.match(styles, /hero-orbit-turn 38s linear infinite/);
  assert.match(styles, /hero-orbit-counterturn 38s linear infinite/);
  assert.match(styles, /@media \(min-width: 1024px\)[\s\S]*\.hero-layout/);
  assert.match(styles, /\.hero-orbit-track \{[\s\S]*background: transparent/);
});
