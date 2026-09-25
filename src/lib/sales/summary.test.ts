import assert from "node:assert/strict";
import test from "node:test";
import { resolveRange } from "../dashboard/range";
import { salesCsv, summarizeSales } from "./summary";

const at = (d: number, h = 10) => new Date(2026, 8, d, h);
const sale = (d: number, price: number, pkg = "1 jour", commission = 10) => ({
  priceCents: price, commissionCents: commission, createdAt: at(d), packageName: pkg,
});

test("totaux, net, panier moyen et jour courant", () => {
  const s = summarizeSales(
    [sale(3, 200), sale(3, 1000, "7 jours", 50), sale(5, 200)],
    { from: at(1, 0), to: new Date(2026, 8, 5, 23, 59) },
    at(5, 18),
  );
  assert.equal(s.revenueCents, 1400);
  assert.equal(s.commissionCents, 70);
  assert.equal(s.netCents, 1330);
  assert.equal(s.count, 3);
  assert.equal(s.averageCents, 467);
  assert.equal(s.todayCents, 200);
  // Chaque jour de la période est présent, même sans vente.
  assert.deepEqual(s.daily.map((d) => d.revenueCents), [0, 0, 1200, 0, 200]);
  assert.deepEqual(s.byPackage.map((p) => [p.name, p.revenueCents, p.part]), [["7 jours", 1000, 71], ["1 jour", 400, 29]]);
});

test("aucune vente : pas de division par zéro", () => {
  const s = summarizeSales([], { from: at(1, 0), to: at(1, 23) }, at(1));
  assert.equal(s.averageCents, 0);
  assert.deepEqual(s.byPackage, []);
});

test("le CSV échappe les séparateurs", () => {
  const csv = salesCsv([{ createdAt: at(3), username: 'a;b', routerName: null, packageName: 'x"y', priceCents: 200, commissionCents: 0 }]);
  assert.match(csv.split("\n")[1], /;"a;b";;"x""y";200;0$/);
});

test("la période par défaut va du 1er du mois à aujourd'hui", () => {
  const r = resolveRange({}, at(24, 15));
  assert.equal(r.fromParam, "2026-09-01");
  assert.equal(r.toParam, "2026-09-24");
  assert.equal(r.activePreset, "month");
  // Bornes inversées : remises dans l'ordre.
  assert.equal(resolveRange({ from: "2026-09-10", to: "2026-09-02" }, at(24)).fromParam, "2026-09-02");
});
