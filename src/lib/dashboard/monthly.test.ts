import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bucketByMonth, enumerateMonths, monthKey, monthsWindowStart } from "./monthly";

describe("fenêtre des six derniers mois", () => {
  it("remonte du mois en cours vers le passé, en gardant les mois vides", () => {
    /* Sauter un mois sans mouvement ferait lire « juin, août » comme deux mois
       consécutifs alors qu'il en manque un entre les deux. */
    assert.deepEqual(enumerateMonths(new Date(2026, 7, 22), 6), [
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("franchit correctement le changement d'année", () => {
    assert.deepEqual(enumerateMonths(new Date(2026, 1, 10), 4), [
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("ne saute pas un mois quand on part d'un 31", () => {
    /* Piège de Date : reculer d'un mois depuis le 31 mars donne le 3 mars,
       parce que février n'a pas de 31 — et « février » disparaît de l'axe.
       D'où le passage par le 1er du mois avant de reculer. */
    assert.deepEqual(enumerateMonths(new Date(2026, 2, 31), 3), [
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });

  it("borne la requête au PREMIER jour du plus ancien mois", () => {
    // Partir du 22 raterait tout ce qui s'est passé du 1er au 21 de ce mois-là.
    const debut = monthsWindowStart(new Date(2026, 7, 22), 6);
    assert.equal(monthKey(debut), "2026-03");
    assert.equal(debut.getDate(), 1);
    assert.equal(debut.getHours(), 0);
  });
});

describe("ventilation par mois", () => {
  const mois = ["2026-06", "2026-07", "2026-08"];

  it("additionne les valeurs dans le bon seau", () => {
    const points = bucketByMonth(mois, [
      { date: new Date(2026, 5, 3), value: 10 },
      { date: new Date(2026, 5, 28), value: 5 },
      { date: new Date(2026, 7, 1), value: 7 },
    ]);
    assert.deepEqual(points, [
      { month: "2026-06", value: 15 },
      { month: "2026-07", value: 0 },
      { month: "2026-08", value: 7 },
    ]);
  });

  it("IGNORE une ligne hors fenêtre au lieu de la rattacher au mois voisin", () => {
    /* Garanti par construction : la sortie est bâtie à partir de `months`, pas
       des lignes. La rattacher gonflerait la barre d'un mois qu'elle ne
       concerne pas — et le total cesserait de correspondre à la légende. */
    const points = bucketByMonth(mois, [
      { date: new Date(2025, 11, 31), value: 999 },
      { date: new Date(2027, 0, 1), value: 999 },
      { date: new Date(2026, 6, 15), value: 3 },
    ]);
    assert.deepEqual(points.map((p) => p.value), [0, 3, 0]);
  });

  it("rend un point par mois, même sans aucune ligne", () => {
    // Un graphique à zéro barre serait indiscernable d'un graphique cassé.
    assert.deepEqual(bucketByMonth(mois, []).map((p) => p.month), mois);
  });
});
