import { access, readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

/* Le hero montre le produit : une console du parc avec les vraies photos de
 * modèles MikroTik, puis une bande de chiffres réels. La scène Three.js en
 * orbite a été retirée (poids du bundle, lisibilité mobile). */

test("la console du hero emploie des photos réelles et se déclare illustrative", async () => {
  const hero = await read("src/components/landing/Hero.tsx");
  for (const img of [...hero.matchAll(/img: "(\/mikrotik\/[^"]+)"/g)].map((m) => m[1])) {
    await access(new URL(`../public${img}`, import.meta.url));
  }
  assert.match(hero, /<figcaption[^>]*>\{t\.console\.caption\}/);
  assert.match(hero, /aria-hidden="true"\s+className="overflow-hidden rounded-2xl/);
  assert.doesNotMatch(hero, /MikrotikOrbitScene|from "three"/);

  const [{ fr }, { en }] = await Promise.all([
    import("../src/lib/i18n/fr.ts"),
    import("../src/lib/i18n/en.ts"),
  ]);
  assert.notEqual(fr.hero.console.caption, en.hero.console.caption, "légende non traduite");
  assert.equal(fr.hero.console.nav.length, en.hero.console.nav.length);
});

test("le hero garde ses chiffres réels, sa capture e-mail et les constructeurs", async () => {
  const hero = await read("src/components/landing/Hero.tsx");
  for (const key of ["routers", "sessions", "trial", "mobileMoney"]) {
    assert.match(hero, new RegExp(`t\\.cards\\.${key}\\b`), `chiffre manquant : ${key}`);
  }
  // Un volume absent est MASQUÉ plutôt qu'affiché à zéro.
  assert.match(hero, /\.filter\(\(c\) => c\.value !== undefined\)/);
  assert.match(hero, /action=\{localeHref\("\/auth\/register", locale\)\}/);
  assert.match(hero, /<VendorMarquee dict=\{dict\} \/>/);
});
