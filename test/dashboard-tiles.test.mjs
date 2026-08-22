import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const vue = () => read("src/app/admin/DashboardView.tsx");

const grille = (src) => src.slice(src.indexOf("t.tiles.title"), src.indexOf("t.charts.title"));

test("chaque tuile de compteur mène à son écran", async () => {
  /* Une tuile qui affiche un chiffre sans donner accès à son détail oblige à
     retrouver l'écran à la main — c'est le « More… » de la référence. */
  const src = await vue();
  const bloc = grille(src);
  const tuiles = bloc.match(/<StatTile\b/g) ?? [];
  assert.equal(tuiles.length, 8, "huit tuiles, comme le modèle");
  const liens = bloc.match(/href=[{"]/g) ?? [];
  assert.equal(liens.length, tuiles.length, "chaque tuile porte un href");
  // StatTile est un <Link>, pas un <div> : le clic entier est la cible.
  assert.match(src, /function StatTile\([\s\S]*?<Link/);
});

test("les huit compteurs du modèle sont couverts, sans doublon", async () => {
  /* Le bandeau héros et la carte Parc ont fondu DANS la grille : leurs
     chiffres n'apparaissent qu'une fois, dans une tuile. Les laisser aussi
     au-dessus aurait fait lire l'encaissé et le parc deux fois. */
  const src = await vue();
  const bloc = grille(src);
  for (const champ of [
    "grossCents",
    "netCents",
    "salesCount",
    "commissionCents",
    "expenseCents",
    "creditCents",
    "activeUsers",
  ]) {
    const occurrences = bloc.split(champ).length - 1;
    assert.equal(occurrences, 1, `${champ} doit figurer dans UNE seule tuile`);
  }
  // La barre segmentée du parc survit à la disparition de sa carte.
  assert.match(bloc, /i < online \? "bg-ok" : "bg-err"/);
  // Et l'appel à lier un premier routeur n'est pas perdu avec la carte vide.
  assert.match(bloc, /t\.tiles\.routersEmpty/);
  assert.match(bloc, /t\.fleet\.link/);
});

test("les histogrammes ignorent le sélecteur de période", async () => {
  /* Sinon la vue par défaut — le mois en cours — n'afficherait qu'une seule
     barre par graphique, ce qui ne compare rien. */
  const page = await read("src/app/admin/page.tsx");
  assert.match(page, /getMonthlySeries\(session\.orgId, now\)/);
  assert.doesNotMatch(page, /getMonthlySeries\([^)]*from/);
});

test("aucune fonction ne traverse la frontière serveur/client", async () => {
  /* BarChart est un composant client, DashboardView un composant serveur :
     lui passer un formateur lève « Functions cannot be passed directly to
     Client Components » au rendu. D'où le discriminant `unit`, comme
     LineChart. */
  const src = await vue();
  assert.match(src, /<BarChart[\s\S]{0,200}unit=\{unit\}/);
  assert.doesNotMatch(src, /<BarChart[\s\S]{0,200}format=\{/);
  const chart = await read("src/components/charts/BarChart.tsx");
  assert.match(chart, /^"use client";/);
  assert.match(chart, /unit\?: "fcfa" \| "count"/);
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
