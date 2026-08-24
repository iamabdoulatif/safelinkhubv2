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

test("l'accent des tuiles ne se montre qu'au survol", async () => {
  /* Huit filets colorés en permanence faisaient une rangée d'arcs-en-ciel là
     où la charte ne pose la couleur que sur ce qu'on désigne. */
  const src = await vue();
  const bloc = src.slice(src.indexOf("const accents = {"), src.indexOf("} as const;", src.indexOf("const accents = {")));
  for (const teinte of ["brand", "ok", "err", "ink"]) {
    assert.match(bloc, new RegExp(`hover:border-t-${teinte}`), `${teinte} doit apparaître au survol`);
    assert.match(bloc, new RegExp(`focus-visible:border-t-${teinte}`), `${teinte} doit suivre le clavier`);
  }
  // Aucun accent inconditionnel : c'était l'état d'avant.
  assert.doesNotMatch(bloc, /(?<!(hover|focus-visible):)border-t-(brand|ok|err)\b/);

  // Le trait garde ses 4 px au repos, en couleur de bordure : rien ne bouge
  // au survol, seule la teinte change.
  assert.match(src, /border-t-4 border-t-line/);
});

test("les histogrammes portent UNE seule couleur, celle de la marque", async () => {
  /* `--chart-1` est l'ocre de :root, que la peau Slate de l'administration ne
     redéfinit pas : les barres sortaient en brun, seule surface de l'écran à
     ignorer le lime du produit. */
  const chart = await read("src/components/charts/BarChart.tsx");
  assert.doesNotMatch(chart, /var\(--chart-1\)/, "plus d'ocre hors charte");
  assert.match(chart, /background: hover === i \? "var\(--brand-deep\)" : "var\(--brand\)"/);
  // Une seule teinte au repos : aucune couleur par série ni par index.
  const teintes = [...chart.matchAll(/var\(--(brand[a-z-]*|chart-\d|ok|err|ink)\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(teintes)].sort(), ["brand", "brand-deep"]);
});

test("les courbes de l'administration suivent la peau Slate", async () => {
  /* `--chart-1` n'était défini que dans :root, en ocre. L'administration
     tourne sous .theme-slate : la courbe « Aperçu » du tableau de bord et
     celle du cockpit commercial sortaient donc en brun, seules surfaces des
     écrans à ignorer le vert du produit. */
  const css = await read("src/app/globals.css");
  const debut = css.indexOf(".theme-slate {");
  assert.ok(debut > 0, "bloc .theme-slate introuvable");
  // Depuis le DÉBUT du bloc : « background: var(--paper) » apparaît aussi plus
  // haut dans le fichier, un indexOf non ancré rendait une tranche vide.
  const slate = css.slice(debut, css.indexOf("}", debut));
  assert.match(slate, /--chart-1: #3F6212;/, "série 1 = le vert de marque");
  assert.match(slate, /--chart-2: #1D4ED8;/, "série 2 garde un bleu distinct");
  // Surtout pas le lime en trait : 1,29:1 sur blanc, il disparaît.
  assert.doesNotMatch(slate, /--chart-1: var\(--brand\)/);
  assert.doesNotMatch(slate, /--chart-1: #C8F24E/i);
});
