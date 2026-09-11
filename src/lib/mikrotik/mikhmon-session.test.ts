import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMikhmonConfigPhp,
  buildMikhmonResyncRos,
  escapeRosLiteral,
  mikhmonLegacyEncrypt,
} from "./mikhmon-session";

/* Ce que le routeur lira une fois les morceaux recollés : on rejoue ici le
   travail du bloc RouterOS (dé-échappement + concaténation) et on le compare au
   config.php que l'app écrit par l'API. Les deux chemins doivent produire le
   MÊME fichier — sinon MikHmon se comporte différemment selon qu'il a été posé
   par l'auto-setup ou par le script d'installation. */
function relitLesGlobales(bloc: string): Record<string, string> {
  const valeurs: Record<string, string> = {};
  for (const ligne of bloc.split("\n")) {
    const m = /^:global (slhCfg\w+) "(.*)"$/.exec(ligne);
    if (!m) continue;
    valeurs[m[1]] = m[2]
      .replace(/\\n/g, "\n")
      .replace(/\\\$/g, "$")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return valeurs;
}

describe("bloc RouterOS de resynchronisation MikHmon", () => {
  const bloc = buildMikhmonResyncRos("SafeLinkHub", "safelinkhub-api", "s3cr3t");
  const g = relitLesGlobales(bloc);

  it("recolle exactement le config.php de l'auto-setup", () => {
    const recolle = g.slhCfgH + g.slhCfgA + g.slhCfg1 + "COUZA-WIFI" + g.slhCfg2 + "10.0.0.1" + g.slhCfg3;
    assert.equal(
      recolle,
      buildMikhmonConfigPhp("SafeLinkHub", {
        ip: "11.11.11.1",
        user: "safelinkhub-api",
        pass: "s3cr3t",
        hotspot: "COUZA-WIFI",
        dns: "10.0.0.1",
        currency: "fcfa",
        autoload: 10,
        iface: 1,
        infolp: "",
        idle: "disable",
        livereport: "enable",
      }),
    );
  });

  it("isole la ligne des identifiants MikHmon, la seule à ne pas être réécrite", () => {
    // Elle voyage seule pour que le bloc puisse lui préférer celle du routeur :
    // l'exploitant a pu changer son mot de passe MikHmon.
    assert.match(g.slhCfgA, /^\$data\['mikhmon'\] = array \(/);
    assert.equal(g.slhCfgN, "$data['mikhmon']");
    assert.ok(!g.slhCfgH.includes("$data['mikhmon']"));
    assert.ok(!g.slhCfg1.includes("$data['mikhmon']"));
  });

  it("porte le mot de passe API dans le chiffre que MikHmon sait relire", () => {
    assert.ok(g.slhCfgH.includes(mikhmonLegacyEncrypt("s3cr3t")) || g.slhCfg1.includes(mikhmonLegacyEncrypt("s3cr3t")));
  });

  it("n'expose aucun $ ni \" nu à RouterOS", () => {
    // Un « $ » nu se ferait interpoler comme variable — le fichier écrit
    // arriverait amputé, et MikHmon ne démarrerait plus.
    for (const ligne of bloc.split("\n")) {
      const litteral = /^:global slhCfg\w+ "(.*)"$/.exec(ligne)?.[1];
      if (!litteral) continue;
      assert.ok(!/(^|[^\\])\$/.test(litteral), `« $ » non échappé dans : ${ligne}`);
      assert.ok(!/(^|[^\\])"/.test(litteral), `guillemet non échappé dans : ${ligne}`);
      assert.ok(!litteral.includes("\n"), "un saut de ligne réel casserait le littéral");
    }
  });

  it("échappe dans le bon ordre — l'antislash d'abord", () => {
    assert.equal(escapeRosLiteral('a\\b"c$d\ne'), 'a\\\\b\\"c\\$d\\ne');
  });
});
