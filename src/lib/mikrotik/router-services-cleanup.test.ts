import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REPORTED_ONLY_SERVICES,
  SUPERFLUOUS_SERVICES,
  superfluousServicesToDisable,
} from "./router-audit-fixes";

describe("ménage des services superflus", () => {
  it("ne retient que ce qui est réellement actif", () => {
    const a = superfluousServicesToDisable({ telnet: true, pptp: false, "bandwidth-test": true });
    assert.deepEqual(a.map((s) => s.id), ["telnet", "bandwidth-test"]);
  });

  it("un service illisible n'est pas déclaré actif", () => {
    /* Sinon le correctif tenterait d'éteindre ce qu'il n'a pas su lire, et le
       rapport annoncerait un durcissement qui n'a pas eu lieu. */
    assert.deepEqual(superfluousServicesToDisable({}), []);
    assert.deepEqual(superfluousServicesToDisable({ telnet: undefined }), []);
  });

  it("ne coupe JAMAIS un canal dont SafeLinkHub ou l'exploitant dépendent", () => {
    /* api = le seul canal de pilotage ; winbox = le dernier recours quand
       l'API tombe — c'est précisément la panne observée sur HS-DIARA-RB4011,
       où WinBox était la seule porte restée ouverte. ftp porte `/export
       file=` et `/system backup save`. */
    const jamais = ["api", "winbox", "ftp", "www", "ssh"];
    for (const id of jamais) {
      assert.ok(
        !SUPERFLUOUS_SERVICES.some((s) => s.id === id),
        `${id} ne doit pas figurer dans la liste des services coupés`,
      );
    }
  });

  it("chaque service coupé porte une raison lisible", () => {
    // Un durcissement sans justification ne s'audite pas : l'exploitant doit
    // pouvoir contester ce qu'on éteint chez lui.
    for (const s of SUPERFLUOUS_SERVICES) {
      assert.ok(s.reason.length > 30, `${s.id} sans raison`);
      assert.ok(s.path.startsWith("/"), `${s.id} sans chemin RouterOS`);
    }
  });

  it("les deux listes ne se recouvrent pas", () => {
    /* TypeScript prouve déjà la disjonction sur les littéraux : la comparaison
       directe est du code mort, il la refuse. On la vérifie donc sur les
       VALEURS élargies — ce qui tient encore le jour où quelqu'un ajoute une
       entrée aux deux listes. */
    const coupes: string[] = SUPERFLUOUS_SERVICES.map((s) => s.id);
    for (const id of REPORTED_ONLY_SERVICES as readonly string[]) {
      assert.ok(!coupes.includes(id), `${id} coupé alors qu'il est seulement signalé`);
    }
  });
});
