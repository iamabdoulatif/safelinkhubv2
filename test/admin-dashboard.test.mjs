import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("le montant s'écrit à la française : nombre puis devise", async () => {
  // L'ancien formateur rendait « FCFA 486 500 », en désaccord avec le site
  // public qui écrit « 486 500 FCFA ».
  const view = await read("src/app/admin/DashboardView.tsx");
  assert.match(view, /return `\$\{fcfa\.format\(cents\)\} FCFA`/);
});

test("aucune fausse légende sous le graphique", async () => {
  const view = await read("src/app/admin/DashboardView.tsx");
  // Le défaut corrigé : quatre valeurs présentées avec des pastilles vert /
  // noir / rouge / lime, alors que le graphique ne trace que deux séries en
  // --chart-1 et --chart-2. Cela ressemblait à une clé de lecture sans en être
  // une. La ventilation existe toujours, mais annoncée comme telle et sans
  // pastilles de couleur.
  assert.doesNotMatch(view, /rounded-full bg-ok/, "pas de pastille de série verte");
  assert.doesNotMatch(view, /rounded-full bg-err/, "le rouge d'ERREUR n'est pas une couleur de série");
  assert.doesNotMatch(view, /rounded-full bg-brand"/, "pas de pastille de série lime");
  // Et une seule légende : LineChart rend déjà la sienne.
  assert.doesNotMatch(view, /SERIES\.map\([\s\S]{0,200}?<li/, "pas de seconde légende");
});

test("les deux séries tracées viennent d'une source unique", async () => {
  const view = await read("src/app/admin/DashboardView.tsx");
  assert.match(view, /const SERIES = \[/);
  assert.match(view, /series=\{SERIES\.map\(/, "le graphique lit la table, il ne la recopie pas");
});

test("les routeurs tombés sont NOMMÉS, pas seulement comptés", async () => {
  // « 3 hors ligne » n'envoie personne nulle part ; les noms si.
  const queries = await read("src/lib/dashboard/queries.ts");
  assert.match(queries, /routersOffline/);
  assert.match(queries, /\.map\(\(r\) => r\.name\)/);

  const view = await read("src/app/admin/DashboardView.tsx");
  assert.match(view, /offline\.join\(" · "\)/, "les noms doivent être affichés");
  // Et l'alerte passe AVANT les chiffres : ce qui exige une action se lit d'abord.
  const alerte = view.indexOf("routeur{offline.length > 1");
  const chiffre = view.indexOf("Encaissé ·");
  assert.ok(alerte > 0 && alerte < chiffre, "l'alerte doit précéder le chiffre d'affaires");
});

test("la présentation du tableau de bord ne touche ni base ni session", async () => {
  // C'est ce qui permet de l'inspecter à l'écran sans se connecter à /admin.
  const view = await read("src/app/admin/DashboardView.tsx");
  for (const forbidden of ['from "@/lib/db"', "getSession", "getDashboardData(", "getSafecoinReport"]) {
    assert.ok(!view.includes(forbidden), `DashboardView ne doit pas importer ${forbidden}`);
  }
  // La page, elle, ne fait plus que chercher les données.
  const page = await read("src/app/admin/page.tsx");
  assert.match(page, /<DashboardView/);
});

test("le bandeau Safecoin n'écrase plus les revenus", async () => {
  const view = await read("src/app/admin/DashboardView.tsx");
  // Il était en pleine largeur, sur un anthracite codé en dur qui échappait à
  // la charte. Il passe dans le rail droit, aux couleurs du thème.
  assert.doesNotMatch(view, /bg-\[#1c1917\]/i, "plus de couleur en dur");
  assert.match(view, /bg-slate-deep/);
});
