import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { relativeExpiry } from "./VoucherTable";

const DAY = 86_400_000;
/** Minuit aujourd'hui + n jours + un décalage horaire, pour tester le calendaire. */
function atDay(offsetDays: number, hour = 15): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime() + offsetDays * DAY + hour * 3_600_000;
}

describe("repère d'expiration relatif", () => {
  it("aujourd'hui, demain, dans N jours", () => {
    assert.equal(relativeExpiry(atDay(0)).text, "expire aujourd'hui");
    assert.equal(relativeExpiry(atDay(0)).tone, "soon");
    assert.equal(relativeExpiry(atDay(1)).text, "demain");
    assert.equal(relativeExpiry(atDay(5)).text, "dans 5 j");
    assert.equal(relativeExpiry(atDay(5)).tone, "normal");
  });
  it("échéance proche (≤ 2 j) colorée warn", () => {
    assert.equal(relativeExpiry(atDay(2)).tone, "soon");
    assert.equal(relativeExpiry(atDay(3)).tone, "normal");
  });
  it("dépassé : hier et au-delà, en tone past", () => {
    assert.equal(relativeExpiry(atDay(-1)).text, "expiré hier");
    assert.equal(relativeExpiry(atDay(-4)).text, "expiré (4 j)");
    assert.equal(relativeExpiry(atDay(-4)).tone, "past");
  });
  it("compte en jours CALENDAIRES : demain-tôt reste « demain », pas « aujourd'hui »", () => {
    // Demain à 1 h du matin peut être < 24 h d'ici, mais c'est un autre jour.
    assert.equal(relativeExpiry(atDay(1, 1)).text, "demain");
    // Aujourd'hui tard le soir reste « aujourd'hui ».
    assert.equal(relativeExpiry(atDay(0, 23)).text, "expire aujourd'hui");
  });
});
