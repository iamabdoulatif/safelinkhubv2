import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

// Exécute le nœud « Décision » de la régulation hors n8n, tel qu'il est publié
// (docs/n8n/regulation-decision.js). Sans ce miroir, la cascade anti-abus
// — bridage, blocages de 2 h, suspension du code au 10e — ne serait vérifiée
// nulle part : elle ne vit que dans un nœud Code d'un workflow distant.
const src = readFileSync(new URL("../docs/n8n/regulation-decision.js", import.meta.url), "utf8");

const GB = 1024 ** 3;
const MB = 1024 ** 2;

const POLICY = {
  softCapMb: 10_000_000,
  hardCapMb: 10_485_760,
  safety: 0.95,
  dayCriticalRatio: 1.1,
  blockLimit: "64k/64k",
  abuseThresholdMb: 300,
  abuseBlockMinutes: 120,
  abuseMaxOffenses: 10,
  abuseThrottleLimit: "256k/256k",
  profileThrottlePct: 50,
};

/** Un passage de décision : état + `watch` précédents, sessions actives lues. */
function decide({ state = null, watch = {}, active = [], counters = 0, at }) {
  const router = {
    routerId: "r1",
    name: "HSPT-TEST",
    billingCycleDay: 1,
    policy: POLICY,
    state,
    watch,
  };
  const read = { at, wanInterface: "E1-WAN-FAI", counters, active };
  const fn = new Function("$", "$input", "console", src);
  return fn(
    () => ({ item: { json: router } }),
    { first: () => ({ json: read }) },
    { log() {} },
  )[0].json;
}

const T0 = "2026-09-10T10:00:00.000Z";
/** Session qui vient de télécharger `gb` gigaoctets depuis le passage précédent. */
const session = (bytesOut) => [
  { mac: "AA:BB:CC:DD:EE:01", address: "10.1.0.5", user: "1j1", bytesOut, bytesIn: 0 },
];

describe("régulation n8n — cascade anti-téléchargement", () => {
  it("un client vu pour la première fois sert de référence, il n'est pas coupable", () => {
    const out = decide({ active: session(9 * GB), at: T0 });
    assert.deepEqual(out.apply.throttles, []);
    assert.deepEqual(out.apply.blocks, []);
    assert.equal(out.apply.watch["AA:BB:CC:DD:EE:01"].offenseCount, 0);
  });

  it("1er dépassement : bride, ne bloque pas", () => {
    const out = decide({
      watch: {
        "AA:BB:CC:DD:EE:01": { bytesOut: 0, blockedUntil: 0, offenseCount: 0, permanent: false, throttledUntil: 0 },
      },
      active: session(2 * GB),
      at: T0,
    });
    assert.deepEqual(out.apply.throttles, [{ address: "10.1.0.5", user: "1j1" }]);
    assert.deepEqual(out.apply.blocks, []);
    assert.deepEqual(out.apply.suspensions, []);
    assert.equal(out.apply.watch["AA:BB:CC:DD:EE:01"].offenseCount, 1);
    assert.equal(out.apply.events.at(-1).kind, "throttle");
  });

  it("le client bridé qui reste sage n'accumule rien", () => {
    const apres = decide({
      watch: {
        "AA:BB:CC:DD:EE:01": {
          bytesOut: 2 * GB,
          blockedUntil: 0,
          offenseCount: 1,
          permanent: false,
          throttledUntil: Date.parse(T0) + 120 * 60000,
        },
      },
      // 50 Mo de plus en 5 min : sous le seuil, c'est de la navigation.
      active: session(2 * GB + 50 * MB),
      at: "2026-09-10T10:05:00.000Z",
    });
    assert.equal(apres.apply.watch["AA:BB:CC:DD:EE:01"].offenseCount, 1);
    assert.deepEqual(apres.apply.blocks, []);
    // Le bridage court toujours : il reste dans l'ensemble voulu.
    assert.equal(apres.apply.throttles.length, 1);
  });

  it("2e dépassement : blocage de 2 h, bridage maintenu", () => {
    const out = decide({
      watch: {
        "AA:BB:CC:DD:EE:01": { bytesOut: 2 * GB, blockedUntil: 0, offenseCount: 1, permanent: false, throttledUntil: 0 },
      },
      active: session(5 * GB),
      at: "2026-09-10T13:00:00.000Z",
    });
    assert.equal(out.apply.blocks.length, 1);
    assert.equal(out.apply.blocks[0].minutes, 120);
    assert.equal(out.apply.throttles.length, 1);
    assert.equal(out.apply.watch["AA:BB:CC:DD:EE:01"].offenseCount, 2);
  });

  it("avant-dernier dépassement : le client est prévenu", () => {
    const out = decide({
      watch: {
        "AA:BB:CC:DD:EE:01": { bytesOut: 0, blockedUntil: 0, offenseCount: 8, permanent: false, throttledUntil: 0 },
      },
      active: session(5 * GB),
      at: T0,
    });
    assert.deepEqual(out.apply.warnings, [{ user: "1j1", remaining: 1 }]);
    assert.deepEqual(out.apply.suspensions, []);
  });

  it("10e dépassement : le CODE est suspendu, plus seulement l'adresse", () => {
    const out = decide({
      watch: {
        "AA:BB:CC:DD:EE:01": { bytesOut: 0, blockedUntil: 0, offenseCount: 9, permanent: false, throttledUntil: 0 },
      },
      active: session(5 * GB),
      at: T0,
    });
    assert.equal(out.apply.suspensions.length, 1);
    assert.equal(out.apply.suspensions[0].user, "1j1");
    assert.equal(out.apply.watch["AA:BB:CC:DD:EE:01"].suspended, true);
    // Un code suspendu ne se bride plus : il n'a plus d'accès du tout.
    assert.deepEqual(out.apply.throttles, []);
    assert.equal(out.apply.events.at(-1).payload.suspended, true);
  });

  it("un code déjà suspendu n'est ni recompté ni re-notifié", () => {
    const out = decide({
      watch: {
        "AA:BB:CC:DD:EE:01": { bytesOut: 0, blockedUntil: Number.MAX_SAFE_INTEGER, offenseCount: 10, permanent: true, suspended: true },
      },
      active: session(9 * GB),
      at: T0,
    });
    assert.deepEqual(out.apply.suspensions, []);
    assert.deepEqual(out.apply.warnings, []);
    assert.equal(out.apply.watch["AA:BB:CC:DD:EE:01"].offenseCount, 10);
  });

  it("un client bloqué n'accumule pas d'infraction pendant sa pause", () => {
    const out = decide({
      watch: {
        "AA:BB:CC:DD:EE:01": {
          bytesOut: 0,
          blockedUntil: Date.parse(T0) + 60 * 60000,
          offenseCount: 3,
          permanent: false,
        },
      },
      active: session(9 * GB),
      at: T0,
    });
    assert.deepEqual(out.apply.blocks, []);
    assert.equal(out.apply.watch["AA:BB:CC:DD:EE:01"].offenseCount, 3);
  });
});
