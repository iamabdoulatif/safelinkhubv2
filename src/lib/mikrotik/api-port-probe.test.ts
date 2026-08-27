import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  candidatePorts,
  describeApiPortVerdict,
  readApiPortProbe,
} from "./api-port-probe";

describe("ports candidats", () => {
  it("essaie le port configuré EN PREMIER", () => {
    /* S'il répond, on s'arrête là : aucune sonde inutile sur les autres ports
       de l'équipement d'un client. */
    assert.deepEqual(candidatePorts(56981), [56981, 8728, 8729]);
  });

  it("ne répète pas le port configuré quand c'est déjà un défaut", () => {
    assert.deepEqual(candidatePorts(8728), [8728, 8729]);
    assert.deepEqual(candidatePorts(8729), [8729, 8728]);
  });

  it("un port absent ou absurde retombe sur les défauts", () => {
    for (const mauvais of [null, undefined, 0, -1, 70000, 1.5, NaN]) {
      assert.deepEqual(
        candidatePorts(mauvais as number | null | undefined),
        [8728, 8729],
        `entrée : ${String(mauvais)}`,
      );
    }
  });
});

describe("lecture de la sonde", () => {
  it("le port configuré répond : rien à signaler", () => {
    assert.deepEqual(readApiPortProbe(8728, [8728, 8729], [8728]), { kind: "ok", port: 8728 });
  });

  it("le port configuré refuse mais un autre répond : décalage corrigible", () => {
    /* C'est exactement la panne vécue le 27/08/2026 : api_port valait 56981
       alors que le routeur écoutait sur 8728. Toutes les actions échouaient
       sur « Connection refused », sans jamais nommer le port. */
    assert.deepEqual(readApiPortProbe(56981, [56981, 8728, 8729], [8728]), {
      kind: "mismatch",
      configured: 56981,
      found: 8728,
    });
  });

  it("le port configuré prime, même si un autre répond aussi", () => {
    /* api-ssl écoute presque toujours à côté. Si le port enregistré marche,
       on ne propose SURTOUT pas d'en changer — la correction doit rester
       silencieuse tant que rien n'est cassé. */
    const v = readApiPortProbe(8728, [8728, 8729], [8728, 8729]);
    assert.equal(v.kind, "ok");
  });

  it("aucun port ne répond : on ne devine pas", () => {
    const v = readApiPortProbe(8728, [8728, 8729], []);
    assert.deepEqual(v, { kind: "unreachable", tried: [8728, 8729] });
    assert.equal(describeApiPortVerdict(v).corrigible, false, "rien à corriger tout seul");
  });
});

describe("ce que lit l'exploitant", () => {
  it("le décalage nomme les DEUX ports et dit que rien n'est écrit sur le routeur", () => {
    const d = describeApiPortVerdict({ kind: "mismatch", configured: 56981, found: 8728 });
    assert.match(d.titre, /56981/);
    assert.match(d.titre, /8728/);
    assert.match(d.detail, /n'écrit RIEN sur l'équipement/i);
    assert.equal(d.corrigible, true);
  });

  it("un port non standard est annoncé comme non devinable", () => {
    // Ne pas laisser croire qu'un bouton va le retrouver : il faut le saisir.
    const d = describeApiPortVerdict({ kind: "unreachable", tried: [8728, 8729] });
    assert.match(d.detail, /énumération ne le trouverait pas/);
    assert.match(d.detail, /IP → Services/);
  });
});
