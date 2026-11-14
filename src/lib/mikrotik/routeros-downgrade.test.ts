import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  belowHardwareFloor,
  compareRosVersion,
  isKnownArch,
  npkFileName,
  npkUrl,
  parseRosVersion,
  validateDowngradeTarget,
} from "./routeros-downgrade";

describe("parse + comparaison de version RouterOS", () => {
  it("lit maj.min.patch et ignore le canal entre parenthèses", () => {
    assert.deepEqual(parseRosVersion("7.25"), [7, 25, 0]);
    assert.deepEqual(parseRosVersion("7.8.1"), [7, 8, 1]);
    assert.deepEqual(parseRosVersion("6.49.18"), [6, 49, 18]);
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
    assert.deepEqual(validateDowngradeTarget("7.8", "7.25"), { ok: true, version: "7.8", crossMajor: false });
    assert.deepEqual(validateDowngradeTarget("7.8.1", "7.19.6 (stable)"), { ok: true, version: "7.8.1", crossMajor: false });
  });

  it("accepte un saut 7 → 6 et le signale (crossMajor)", () => {
    assert.deepEqual(validateDowngradeTarget("6.49.18", "7.25"), {
      ok: true,
      version: "6.49.18",
      crossMajor: true,
    });
  });

  it("refuse une cible ≥ version actuelle (ce n'est pas un recul)", () => {
    const r = validateDowngradeTarget("7.25", "7.25");
    assert.equal(r.ok, false);
    const r2 = validateDowngradeTarget("7.26", "7.25");
    assert.equal(r2.ok, false);
  });

  it("refuse sous la 6.0 (netinstall obligatoire)", () => {
    const r = validateDowngradeTarget("5.26", "7.25");
    assert.equal(r.ok, false);
    assert.match((r as { error: string }).error, /netinstall/i);
  });

  it("refuse une saisie illisible", () => {
    assert.equal(validateDowngradeTarget("", "7.25").ok, false);
    assert.equal(validateDowngradeTarget("latest", "7.25").ok, false);
  });

  it("valide même sans version actuelle connue", () => {
    assert.deepEqual(validateDowngradeTarget("7.8", null), { ok: true, version: "7.8", crossMajor: false });
  });
});

describe("nom + URL du paquet .npk", () => {
  it("v7 : version avant architecture", () => {
    assert.equal(npkFileName("7.8", "arm64"), "routeros-7.8-arm64.npk");
    assert.equal(
      npkUrl("7.8", "arm64"),
      "https://download.mikrotik.com/routeros/7.8/routeros-7.8-arm64.npk",
    );
  });
  it("v6 : architecture avant version (ordre inversé)", () => {
    assert.equal(npkFileName("6.49.18", "mipsbe"), "routeros-mipsbe-6.49.18.npk");
    assert.equal(
      npkUrl("6.49.18", "mipsbe"),
      "https://download.mikrotik.com/routeros/6.49.18/routeros-mipsbe-6.49.18.npk",
    );
  });
  it("connaît les architectures MikroTik courantes", () => {
    assert.equal(isKnownArch("arm64"), true);
    assert.equal(isKnownArch("mmips"), true);
    assert.equal(isKnownArch("sparc"), false);
  });
});

describe("belowHardwareFloor", () => {
  it("bloque une cible sous le plancher matériel", () => {
    assert.equal(belowHardwareFloor("6.49", "7.12"), true);
    assert.equal(belowHardwareFloor("7.8", "7.12"), true);
  });
  it("laisse passer une cible ≥ plancher", () => {
    assert.equal(belowHardwareFloor("6.49", "6.44.6"), false);
    assert.equal(belowHardwareFloor("7.12", "7.12"), false);
  });
  it("renvoie null si le plancher est inconnu (on laisse RouterOS trancher)", () => {
    assert.equal(belowHardwareFloor("6.49", null), null);
    assert.equal(belowHardwareFloor("6.49", undefined), null);
    assert.equal(belowHardwareFloor("6.49", "n/a"), null);
  });
});
