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
  for (const label of ["Routeurs supervisés", "Sessions en cours", "Essai offert", "Mobile money"]) {
    assert.ok(hero.includes(label), `plaque manquante : ${label}`);
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
    assert.ok(styles.includes(selector), `${selector} doit exister`);
  }
  for (const duration of ["26s", "28s", "30s", "32s"]) {
    assert.match(styles, new RegExp(`animation:[^;]*${duration}`), `durée manquante : ${duration}`);
  }
  assert.match(styles, /@media \(min-width: 1280px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.hero-orbit-router/);
});
