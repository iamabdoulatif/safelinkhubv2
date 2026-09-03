import test from "node:test";
import assert from "node:assert/strict";
import { grouperForfaits, tarifJournalier, dureeEnMinutes, type ForfaitBrut } from "./package-ladder";

function forfait(over: Partial<ForfaitBrut>): ForfaitBrut {
  return {
    id: over.name ?? "id",
    name: "X",
    priceCents: 100,
    durationValue: 1,
    durationUnit: "Days",
    commissionCents: 0,
    uploadMbps: 5,
    downloadMbps: 5,
    active: true,
    routerId: "r1",
    routerName: "HSPT-KALAM",
    ...over,
  };
}

test("la durée se ramène aux minutes, l'unité inconnue reste nulle", () => {
  assert.equal(dureeEnMinutes(5, "Hours"), 300);
  assert.equal(dureeEnMinutes(1, "Months"), 43200);
  assert.equal(dureeEnMinutes(2, "Lunes"), null);
  assert.equal(tarifJournalier(100, 300), 480);
  assert.equal(tarifJournalier(3000, 43200), 100);
  assert.equal(tarifJournalier(500, null), null);
});

test("chaque zone est triée par durée croissante, le global en dernier", () => {
  const zones = grouperForfaits([
    forfait({ name: "01-MOIS", durationValue: 1, durationUnit: "Months", priceCents: 3000 }),
    forfait({ name: "05-HEURES", durationValue: 5, durationUnit: "Hours", priceCents: 100 }),
    forfait({ name: "GLOBAL", routerId: null, routerName: null }),
    forfait({ name: "01-JOUR", durationValue: 1, durationUnit: "Days", priceCents: 300 }),
  ]);
  assert.deepEqual(
    zones.map((z) => z.nom),
    ["HSPT-KALAM", "Tous les routeurs"],
  );
  assert.deepEqual(
    zones[0].forfaits.map((f) => f.name),
    ["05-HEURES", "01-JOUR", "01-MOIS"],
  );
  // Grille saine : le tarif journalier décroît quand la durée s'allonge.
  assert.deepEqual(
    zones[0].forfaits.map((f) => f.parJour),
    [480, 300, 100],
  );
  assert.deepEqual(
    zones[0].forfaits.map((f) => f.inversion),
    [false, false, false],
  );
});

test("un palier plus long mais plus cher par jour est signalé, avec son voisin", () => {
  const [zone] = grouperForfaits([
    forfait({ name: "01-JOUR", durationValue: 1, durationUnit: "Days", priceCents: 300 }),
    // 4 jours à 1 400 = 350 F/jour : plus cher que le forfait d'un jour.
    forfait({ name: "04-JOURS", durationValue: 4, durationUnit: "Days", priceCents: 1400 }),
  ]);
  assert.equal(zone.forfaits[1].inversion, true);
  assert.equal(zone.forfaits[1].inversionContre, "01-JOUR");
  // Le même palier désactivé ne dérange plus personne.
  const [zoneOff] = grouperForfaits([
    forfait({ name: "01-JOUR", durationValue: 1, durationUnit: "Days", priceCents: 300 }),
    forfait({
      name: "04-JOURS",
      durationValue: 4,
      durationUnit: "Days",
      priceCents: 1400,
      active: false,
    }),
  ]);
  assert.equal(zoneOff.forfaits[1].inversion, false);

  // À tarif journalier ÉGAL, rien à signaler : le palier plus long reste un
  // choix normal, il n'offre simplement aucune remise de volume.
  const [egal] = grouperForfaits([
    forfait({ name: "01-SEMAINE", durationValue: 1, durationUnit: "Weeks", priceCents: 700 }),
    forfait({ name: "10-JOURS", durationValue: 10, durationUnit: "Days", priceCents: 1000 }),
  ]);
  assert.deepEqual(
    egal.forfaits.map((f) => f.parJour),
    [100, 100],
  );
  assert.equal(egal.forfaits[1].inversion, false);
});

test("ce qui est identique partout se dit une fois : débit et commission", () => {
  const [uniforme] = grouperForfaits([forfait({ name: "A" }), forfait({ name: "B" })]);
  assert.equal(uniforme.debitCommun, "5M/5M");
  assert.equal(uniforme.commissionCommune, 0);

  const [mixte] = grouperForfaits([
    forfait({ name: "A" }),
    forfait({ name: "B", downloadMbps: 10, commissionCents: 50 }),
  ]);
  assert.equal(mixte.debitCommun, null);
  assert.equal(mixte.commissionCommune, null);
});
