import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareRosVersion,
  isKnownArch,
  npkUrl,
  parseRosVersion,
  validateDowngradeTarget,
} from "./routeros-downgrade";

describe("parse + comparaison de version RouterOS", () => {
  it("lit maj.min.patch et ignore le canal entre parenthèses", () => {
    assert.deepEqual(parseRosVersion("7.25"), [7, 25, 0]);
    assert.deepEqual(parseRosVersion("7.8.1"), [7, 8, 1]);
    assert.deepEqual(parseRosVersion("7.19.6 (stable)"), [7, 19, 6]);
    assert.equal(parseRosVersion("tchoin"), null);
  });

  it("compare numériquement (7.8 < 7.24, pas en texte)", () => {
    assert.equal(compareRosVersion([7, 8, 0], [7, 24, 0]), -1);
    assert.equal(compareRosVersion([7, 24, 0], [7, 8, 0]), 1);
    assert.equal(compareRosVersion([7, 8, 1], [7, 8, 1]), 0);
  });
});

describe("validateDowngradeTarget", () => {
  it("accepte un recul 7.x strict et renvoie la version normalisée", () => {
    assert.deepEqual(validateDowngradeTarget("7.8", "7.25"), { ok: true, version: "7.8" });
    assert.deepEqual(validateDowngradeTarget("7.8.1", "7.19.6 (stable)"), { ok: true, version: "7.8.1" });
  });

  it("refuse une cible ≥ version actuelle (ce n'est pas un recul)", () => {
    const r = validateDowngradeTarget("7.25", "7.25");
    assert.equal(r.ok, false);
    const r2 = validateDowngradeTarget("7.26", "7.25");
    assert.equal(r2.ok, false);
  });

  it("refuse un saut sous 7.0 (6.x = netinstall obligatoire)", () => {
    const r = validateDowngradeTarget("6.49", "7.25");
    assert.equal(r.ok, false);
    assert.match((r as { error: string }).error, /netinstall/i);
  });

  it("refuse une saisie illisible", () => {
    assert.equal(validateDowngradeTarget("", "7.25").ok, false);
    assert.equal(validateDowngradeTarget("latest", "7.25").ok, false);
  });

  it("valide même sans version actuelle connue (tant que c'est du 7.x)", () => {
    assert.deepEqual(validateDowngradeTarget("7.8", null), { ok: true, version: "7.8" });
  });
});

describe("URL du paquet .npk", () => {
  it("construit l'URL combinée par version + architecture", () => {
    assert.equal(
      npkUrl("7.8", "arm64"),
      "https://download.mikrotik.com/routeros/7.8/routeros-7.8-arm64.npk",
    );
  });
  it("connaît les architectures MikroTik courantes", () => {
    assert.equal(isKnownArch("arm64"), true);
    assert.equal(isKnownArch("mmips"), true);
    assert.equal(isKnownArch("sparc"), false);
  });
});
