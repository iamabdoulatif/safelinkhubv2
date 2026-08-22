import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { previousRange, variation } from "./platform-analytics";

describe("période précédente", () => {
  it("a la même durée et s'arrête juste avant la période courante", () => {
    const from = new Date(2026, 7, 1, 0, 0, 0, 0);
    const toEnd = new Date(2026, 7, 31, 23, 59, 59, 999);
    const p = previousRange(from, toEnd);

    assert.equal(p.toEnd.getTime(), from.getTime() - 1, "aucun recouvrement d'une milliseconde");
    assert.equal(
      p.toEnd.getTime() - p.from.getTime(),
      toEnd.getTime() - from.getTime(),
      "durées identiques, sinon la comparaison ne veut rien dire",
    );
  });

  it("suit une période courte aussi bien qu'un mois", () => {
    const from = new Date(2026, 7, 20, 0, 0, 0, 0);
    const toEnd = new Date(2026, 7, 22, 23, 59, 59, 999);
    const p = previousRange(from, toEnd);
    // Trois jours analysés → les trois jours d'avant.
    assert.equal(p.from.getDate(), 17);
    assert.equal(p.toEnd.getDate(), 19);
  });
});

describe("variation d'un indicateur", () => {
  it("refuse de comparer à zéro", () => {
    /* « +100 % » à partir de rien n'a aucun sens, et « +∞ » encore moins :
       l'écran affiche un libellé au lieu d'un chiffre inventé. */
    assert.equal(variation(50_000, 0).comparable, false);
    assert.equal(variation(0, 0).comparable, false);
  });

  it("calcule hausse et baisse", () => {
    const hausse = variation(150, 100);
    assert.equal(hausse.comparable && hausse.sens, "hausse");
    assert.equal(hausse.comparable && Math.round(hausse.pourcent), 50);

    const baisse = variation(80, 100);
    assert.equal(baisse.comparable && baisse.sens, "baisse");
    assert.equal(baisse.comparable && Math.round(baisse.pourcent), -20);
  });

  it("dit « stable » plutôt que d'afficher une flèche pour +0 %", () => {
    const v = variation(1000, 1001);
    assert.equal(v.comparable && v.sens, "stable");
  });
});

describe("le cockpit ne peut plus mentir sur ses couleurs", () => {
  it("graphique et journal lisent la MÊME table de couleurs", async () => {
    /* La légende du bandeau annonçait `--ink` pour le VPN et `--brand` pour
       l'Auto-Setup, quand la courbe traçait `--chart-1` et `--chart-2` : le
       moutarde de la légende désignait la mauvaise série. */
    const vue = await readFile(
      new URL("../../app/admin/analytics/PlatformAnalyticsView.tsx", import.meta.url),
      "utf8",
    );
    assert.match(vue, /const COULEUR_SERIE = \{[^}]*chart-1[^}]*chart-2[^}]*\}/);
    assert.doesNotMatch(
      vue,
      /className="h-2\.5 w-2\.5 bg-ink"/,
      "plus de légende recopiée à la main : LineChart dessine la sienne",
    );
    assert.match(vue, /COULEUR_SERIE\[row\.kind\]/, "la pastille du journal suit la courbe");
  });

  it("les cartes comparent des valeurs brutes, pas du texte formaté", async () => {
    const vue = await readFile(
      new URL("../../app/admin/analytics/PlatformAnalyticsView.tsx", import.meta.url),
      "utf8",
    );
    // `value` est déjà passé par formatFcfa : le comparer donnerait NaN.
    assert.match(vue, /actuel=\{report\.kpis\.totalAmountFcfa\}/);
    assert.match(vue, /precedent=\{previousKpis\.totalAmountFcfa\}/);
  });

  it("la page lit les deux fenêtres en une seule requête", async () => {
    const page = await readFile(
      new URL("../../app/admin/analytics/page.tsx", import.meta.url),
      "utf8",
    );
    assert.match(page, /previousRange\(from, toEnd\)/);
    // La borne basse SQL descend jusqu'à la période précédente…
    assert.match(page, /gte\(autoSetupAuthorizations\.createdAt, precedent\.from\)/);
    assert.match(page, /gte\(remoteAccessAuthorizations\.createdAt, precedent\.from\)/);
    // …et le découpage se fait en mémoire, sinon le rapport courant
    // engloberait la période précédente et doublerait tous les chiffres.
    assert.match(page, /dansPeriode\(row, from, toEnd\)/);
  });
});
