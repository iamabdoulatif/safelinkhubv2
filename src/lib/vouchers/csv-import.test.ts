import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchPackageForProfile,
  parseMikhmonVoucherCsv,
} from "./csv-import";
import { durationFromProfileName } from "./expiry";

const MIKHMON_CSV = [
  "Username,Password,Profile,Time Limit,Data Limit,Comment",
  "1jyd59,1jyd59,01-JOUR,,,vc-850-05.11.26-alima",
  "1ji997,1ji997,01-JOUR,,,\"vente, matin\"",
].join("\n");

describe("parseMikhmonVoucherCsv", () => {
  it("lit un export MikHmon sans exposer le mot de passe", () => {
    const result = parseMikhmonVoucherCsv(MIKHMON_CSV);

    assert.equal(result.rows.length, 2);
    assert.deepEqual(result.rows[0], {
      line: 2,
      username: "1jyd59",
      profileName: "01-JOUR",
      comment: "vc-850-05.11.26-alima",
      timeLimit: null,
      dataLimit: null,
    });
    assert.equal("password" in result.rows[0], false);
    assert.equal(result.rows[1].comment, "vente, matin");
  });

  it("accepte le BOM et un séparateur point-virgule", () => {
    const result = parseMikhmonVoucherCsv(
      "\uFEFFUsername;Password;Profile;Time Limit;Data Limit;Comment\nabc;abc;1 JOUR;;;test",
    );

    assert.equal(result.delimiter, ";");
    assert.equal(result.rows[0].profileName, "1 JOUR");
  });

  it("écarte les codes vides et doublons du fichier", () => {
    const result = parseMikhmonVoucherCsv(
      "Username,Profile\n,01-JOUR\nabc,01-JOUR\nabc,01-JOUR",
    );

    assert.equal(result.rows.length, 1);
    assert.deepEqual(result.issues.map((issue) => issue.line), [2, 4]);
  });
});

describe("reconnaissance des profils MikHmon", () => {
  it("normalise les variantes du profil un jour", () => {
    assert.deepEqual(durationFromProfileName("01-JOUR"), {
      durationValue: 1,
      durationUnit: "Days",
      billingStartsOn: "Upon First Use",
    });
    assert.equal(durationFromProfileName("1 jours")?.durationUnit, "Days");
  });

  it("associe le profil normalisé au forfait de l'organisation", () => {
    const match = matchPackageForProfile("01 JOUR", [
      { id: "day", durationValue: 1, durationUnit: "Days" },
      { id: "week", durationValue: 1, durationUnit: "Weeks" },
    ]);

    assert.equal(match?.id, "day");
    assert.equal(matchPackageForProfile("99-ANS", []), undefined);
  });
});
