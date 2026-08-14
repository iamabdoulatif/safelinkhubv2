import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VOUCHER_PROFILES, TV_PC_MONTH_PROFILE } from "./voucher-profiles";

/** Prix et durée sont inscrits DANS le script du profil, pas à côté. */
function embeddedPriceAndDuration(onLogin: string) {
  const match = onLogin.match(/:put \(",remc,(\d+),([0-9a-z]+),/);
  return match ? { price: Number(match[1]), duration: match[2] } : null;
}

describe("catalogue de profils posé par l'auto-setup", () => {
  it("garde les six profils historiques intacts", () => {
    // Ce sont les tarifs réellement pratiqués : une modification accidentelle
    // ferait vendre au mauvais prix sur tout routeur installé ensuite, et le
    // journal MikHmon reprendrait ce prix tel quel.
    const expected = [
      ["01-JOUR", 200, "1d"],
      ["05-JOURS", 500, "5d"],
      ["01-SEMAINE", 700, "7d"],
      ["02-SEMAINES", 1000, "14d"],
      ["01-MOIS", 2000, "30d"],
      ["05-MINS", 10, "5m"],
    ] as const;

    for (const [name, price, duration] of expected) {
      const profile = VOUCHER_PROFILES.find((entry) => entry.name === name);
      assert.ok(profile, `${name} doit rester au catalogue`);
      assert.deepEqual(embeddedPriceAndDuration(profile.onLogin), { price, duration }, name);
    }
  });

  it("ajoute MOIS-TV/PC : un mois, 5 000 FCFA, débit dédié", () => {
    const profile = VOUCHER_PROFILES.find((entry) => entry.name === "MOIS-TV/PC");
    assert.ok(profile, "le profil doit être posé par l'auto-setup");
    assert.equal(profile, TV_PC_MONTH_PROFILE);
    assert.deepEqual(embeddedPriceAndDuration(profile.onLogin), { price: 5000, duration: "30d" });
    assert.equal(profile.rateLimit, "10M/10M");
    // Le planificateur d'expiration doit suivre la même durée que le tarif.
    assert.match(profile.onLogin, /interval="30d"/);
  });

  it("ne laisse aucune trace du gabarit 01-JOUR dont il dérive", () => {
    // buildVoucherProfile procède par remplacements successifs : un seul oubli
    // et le profil supprimerait ses comptes au bout d'un jour, ou les
    // inscrirait au journal sous le nom d'un autre forfait.
    const { onLogin, monitorOnEvent } = TV_PC_MONTH_PROFILE;
    assert.doesNotMatch(onLogin, /,200,1d,200,/);
    assert.doesNotMatch(onLogin, /interval="1d"/);
    assert.doesNotMatch(onLogin, /-\|-01-JOUR-\|-/);
    assert.match(onLogin, /-\|-MOIS-TV\/PC-\|-/);
    assert.doesNotMatch(monitorOnEvent, /profile="01-JOUR"/);
    assert.match(monitorOnEvent, /profile="MOIS-TV\/PC"/);
  });

  it("porte un nom que MikHmon saura relire", () => {
    // MikHmon découpe le nom du script de vente sur « -|- ». Un nom de profil
    // contenant ce séparateur décalerait toutes les colonnes du journal.
    for (const profile of VOUCHER_PROFILES) {
      assert.ok(!profile.name.includes("-|-"), `${profile.name} casserait le journal MikHmon`);
    }
  });

  it("ne fait pas battre deux balayages à la même seconde", () => {
    // Chaque profil crée un planificateur de balayage ; les faire tous partir
    // au même instant chargerait le routeur d'un coup.
    const intervals = VOUCHER_PROFILES.map((profile) => profile.monitorInterval);
    assert.equal(new Set(intervals).size, intervals.length, `intervalles en double : ${intervals}`);
  });
});
