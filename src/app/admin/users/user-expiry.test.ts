import assert from "node:assert/strict";
import test from "node:test";
import { expiryHint } from "./user-expiry";

const le = (iso: string) => new Date(iso);

test("dit le temps qui reste, pas la date à recalculer de tête", () => {
  const maintenant = le("2026-09-03T10:00:00");
  assert.equal(expiryHint("2026-09-28T00:00:00", maintenant).label, "expire dans 25 j");
  assert.equal(expiryHint("2026-09-10T00:00:00", maintenant).tone, "urgent");
  assert.equal(expiryHint("2026-12-01T00:00:00", maintenant).label, "expire dans 3 mois");
});

test("compte en JOURS DE CALENDRIER : à 23 h, demain reste demain", () => {
  // En différence brute d'horodatages, 23 h → lendemain 8 h fait 0,4 jour,
  // donc « dans 0 j » — un message qui affole pour rien.
  const tard = le("2026-09-03T23:00:00");
  assert.equal(expiryHint("2026-09-04T08:00:00", tard).label, "expire demain");
  assert.equal(expiryHint("2026-09-03T23:59:00", tard).label, "expire aujourd'hui");
});

test("le passé se dit au passé", () => {
  const maintenant = le("2026-09-03T10:00:00");
  assert.equal(expiryHint("2026-09-02T10:00:00", maintenant).label, "expiré hier");
  assert.equal(expiryHint("2026-08-24T10:00:00", maintenant).tone, "over");
});

test("sans date, aucune mention — pas de « — » ni de faux calme", () => {
  assert.deepEqual(expiryHint(null), { label: "", tone: "none" });
  assert.equal(expiryHint("pas une date").tone, "none");
});
