import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const vue = () => read("src/app/admin/DashboardView.tsx");

test("chaque tuile de compteur mène à son écran", async () => {
  /* Une tuile qui affiche un chiffre sans donner accès à son détail oblige à
     retrouver l'écran à la main — c'est le « More… » de la référence. */
  const src = await vue();
  const bloc = src.slice(src.indexOf("t.tiles.title"), src.indexOf("stagger mt-4"));
  const tuiles = bloc.match(/<StatTile\b/g) ?? [];
  const liens = bloc.match(/href="\/admin\/[a-z-]+"/g) ?? [];
  assert.equal(tuiles.length, 4, "quatre tuiles attendues");
  assert.equal(liens.length, tuiles.length, "chaque tuile porte un href");
  // StatTile est un <Link>, pas un <div> : le clic entier est la cible.
  assert.match(src, /function StatTile\([\s\S]*?<Link/);
});

test("la rangée ne redit pas ce que l'écran affiche déjà", async () => {
  /* Le bandeau d'en-tête porte l'encaissé (brut) et le net ; la carte Parc
     porte les routeurs en ligne et les sessions actives. Les remettre en
     tuiles aurait rempli la grille en faisant lire deux fois la même chose —
     c'est pour ça qu'il y en a quatre et non huit. */
  const src = await vue();
  const bloc = src.slice(src.indexOf("t.tiles.title"), src.indexOf("stagger mt-4"));
  for (const champ of ["grossCents", "netCents", "routersOnline", "activeUsers"]) {
    assert.doesNotMatch(bloc, new RegExp(champ), `${champ} est déjà affiché ailleurs`);
  }
  // Et le crédit du portefeuille, lui, n'était affiché NULLE PART : c'est la
  // seule valeur déjà calculée que l'écran laissait tomber.
  assert.match(bloc, /creditCents/);
});

test("la ventilation en double a disparu du graphique", async () => {
  /* Ses quatre valeurs se lisent désormais dans le bandeau (brut, net) et dans
     les tuiles (commissions, dépenses). La garder aurait fait lire les mêmes
     chiffres trois fois sur un seul écran. */
  const src = await vue();
  assert.doesNotMatch(src, /t\.breakdown\./);
  for (const dict of ["src/lib/i18n/admin/fr.ts", "src/lib/i18n/admin/en.ts"]) {
    assert.doesNotMatch(await read(dict), /^\s+breakdown: \{/m, `${dict} garde des chaînes mortes`);
  }
});

test("les deux dictionnaires décrivent les mêmes tuiles", async () => {
  const cles = async (f) => {
    const src = await read(f);
    const bloc = src.slice(src.indexOf("    tiles: {"), src.indexOf("    recent: {"));
    assert.ok(bloc.includes("tiles"), `bloc tiles introuvable dans ${f}`);
    return [...bloc.matchAll(/^\s{6}(\w+):/gm)].map((m) => m[1]).sort();
  };
  assert.deepEqual(
    await cles("src/lib/i18n/admin/fr.ts"),
    await cles("src/lib/i18n/admin/en.ts"),
  );
});
