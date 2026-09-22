import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideRegulation } from "./regulation-decision";
import type { RegulationWatchEntry } from "@/lib/db/schema";

/**
 * La cascade anti-téléchargement, vérifiée sur la fonction que la plateforme
 * exécute vraiment (elle vivait dans un nœud n8n, voir regulation-decision.ts).
 */
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

const T0 = "2026-09-10T10:00:00.000Z";

function decide(o: {
  watch?: Record<string, RegulationWatchEntry>;
  active?: { mac: string; address: string; user: string; bytesOut: number; bytesIn: number }[];
  at?: string;
}) {
  return decideRegulation({
    policy: POLICY,
    billingCycleDay: 1,
    state: null,
    watch: o.watch ?? {},
    counters: 0,
    wanInterface: "E1-WAN-FAI",
    active: o.active ?? [],
    at: new Date(o.at ?? T0),
  });
}

const MAC = "AA:BB:CC:DD:EE:01";
const session = (bytesOut: number) => [
  { mac: MAC, address: "10.1.0.5", user: "1j1", bytesOut, bytesIn: 0 },
];
/** Un appareil déjà vu, par défaut au passage précédent (il y a 5 min). */
const vu = (e: Partial<RegulationWatchEntry>): Record<string, RegulationWatchEntry> => ({
  [MAC]: {
    bytesOut: 0,
    blockedUntil: 0,
    offenseCount: 0,
    permanent: false,
    throttledUntil: 0,
    at: Date.parse(T0) - 300 * 1000,
    ...e,
  },
});

describe("régulation — cascade anti-téléchargement", () => {
  it("un client vu pour la première fois sert de référence, il n'est pas coupable", () => {
    const out = decide({ active: session(9 * GB) });
    assert.deepEqual(out.throttles, []);
    assert.deepEqual(out.blocks, []);
    assert.equal(out.watch[MAC].offenseCount, 0);
  });

  it("1er dépassement : bride, ne bloque pas", () => {
    const out = decide({ watch: vu({}), active: session(2 * GB) });
    assert.deepEqual(out.throttles, [{ address: "10.1.0.5", user: "1j1" }]);
    assert.deepEqual(out.blocks, []);
    assert.deepEqual(out.suspensions, []);
    assert.equal(out.watch[MAC].offenseCount, 1);
    assert.equal(out.events.at(-1)!.kind, "throttle");
  });

  it("mesure un DÉBIT, pas un volume : une longue interruption ne punit personne", () => {
    // Cas réel du 22/09/2026 : la régulation s'est arrêtée 17 h, et au retour
    // le premier passage a vu 0,5 Go de cumul par client — une vitesse de
    // 8 ko/s, soit de la navigation, pas un téléchargement abusif.
    const out = decide({
      watch: vu({ bytesOut: 0, at: Date.parse(T0) - 17 * 3600 * 1000 }),
      active: session(500 * MB),
    });
    assert.deepEqual(out.throttles, []);
    assert.deepEqual(out.blocks, []);
    assert.equal(out.watch[MAC].offenseCount, 0);
  });

  it("la même quantité en cinq minutes, elle, est bien un abus", () => {
    const out = decide({
      watch: vu({ bytesOut: 0, at: Date.parse(T0) - 300 * 1000 }),
      active: session(500 * MB),
    });
    assert.equal(out.throttles.length, 1);
    assert.equal(out.watch[MAC].offenseCount, 1);
  });

  it("un relevé sans instant de référence ne juge pas : il sert de référence", () => {
    // Cas des entrées mémorisées avant l'ajout du champ `at` : l'intervalle
    // est inconnu, le supposer court a bridé 44 clients à des vitesses
    // impossibles (45 Mbit/s sur des forfaits à 10).
    const sansAt: Record<string, RegulationWatchEntry> = {
      [MAC]: { bytesOut: 0, blockedUntil: 0, offenseCount: 0, permanent: false, throttledUntil: 0 },
    };
    const out = decide({ watch: sansAt, active: session(2 * GB) });
    assert.deepEqual(out.throttles, []);
    assert.deepEqual(out.blocks, []);
    assert.equal(out.watch[MAC].offenseCount, 0);
    // …et le passage suivant, lui, dispose de la référence.
    assert.equal(typeof out.watch[MAC].at, "number");
  });

  it("le client bridé qui reste sage n'accumule rien", () => {
    const out = decide({
      watch: vu({ bytesOut: 2 * GB, offenseCount: 1, throttledUntil: Date.parse(T0) + 120 * 60000 }),
      active: session(2 * GB + 50 * MB), // 50 Mo en 5 min : de la navigation
      at: "2026-09-10T10:05:00.000Z",
    });
    assert.equal(out.watch[MAC].offenseCount, 1);
    assert.deepEqual(out.blocks, []);
    assert.equal(out.throttles.length, 1);
  });

  it("2e dépassement : blocage de 2 h, bridage maintenu", () => {
    const T1 = "2026-09-10T13:00:00.000Z"; // la pause de 2 h est passée
    const out = decide({
      watch: vu({ bytesOut: 2 * GB, offenseCount: 1, at: Date.parse(T1) - 300 * 1000 }),
      active: session(5 * GB),
      at: T1,
    });
    assert.equal(out.blocks.length, 1);
    assert.equal(out.blocks[0].minutes, 120);
    assert.equal(out.throttles.length, 1);
    assert.equal(out.watch[MAC].offenseCount, 2);
  });

  it("avant-dernier dépassement : le client est prévenu", () => {
    const out = decide({ watch: vu({ offenseCount: 8 }), active: session(5 * GB) });
    assert.deepEqual(out.warnings, [{ user: "1j1", remaining: 1 }]);
    assert.deepEqual(out.suspensions, []);
  });

  it("10e dépassement : le CODE est suspendu, plus seulement l'adresse", () => {
    const out = decide({ watch: vu({ offenseCount: 9 }), active: session(5 * GB) });
    assert.equal(out.suspensions.length, 1);
    assert.equal(out.suspensions[0].user, "1j1");
    assert.equal(out.watch[MAC].suspended, true);
    // Un code suspendu ne se bride plus : il n'a plus d'accès du tout.
    assert.deepEqual(out.throttles, []);
    assert.equal(out.events.at(-1)!.payload.suspended, true);
  });

  it("un code déjà suspendu n'est ni recompté ni re-notifié", () => {
    const out = decide({
      watch: vu({ offenseCount: 10, permanent: true, suspended: true, blockedUntil: Number.MAX_SAFE_INTEGER }),
      active: session(9 * GB),
    });
    assert.deepEqual(out.suspensions, []);
    assert.deepEqual(out.warnings, []);
    assert.equal(out.watch[MAC].offenseCount, 10);
  });

  it("un client bloqué n'accumule pas d'infraction pendant sa pause", () => {
    const out = decide({
      watch: vu({ offenseCount: 3, blockedUntil: Date.parse(T0) + 60 * 60000 }),
      active: session(9 * GB),
    });
    assert.deepEqual(out.blocks, []);
    assert.equal(out.watch[MAC].offenseCount, 3);
  });
});

describe("régulation — rythme du quota", () => {
  it("un compteur qui recule (routeur redémarré) ne rend pas un delta négatif", () => {
    const out = decideRegulation({
      policy: POLICY,
      billingCycleDay: 1,
      state: {
        decision: "ok", previous: "ok", limit: "0/0", wanInterface: "E1-WAN-FAI",
        counters: 900 * GB, monthBytes: 900 * GB, dayBytes: 10 * GB,
        monthKey: "2026-09-01", dayKey: "2026-09-10", at: T0, changedAt: null,
      },
      watch: {},
      counters: 5 * GB, // le routeur a rebooté : compteurs repartis de zéro
      wanInterface: "E1-WAN-FAI",
      active: [],
      at: new Date(T0),
    });
    assert.equal(out.state.monthBytes, 905 * GB);
  });

  it("le cycle repart à zéro au jour de facturation", () => {
    const out = decideRegulation({
      policy: POLICY,
      billingCycleDay: 1,
      state: {
        decision: "block", previous: "block", limit: "64k/64k", wanInterface: null,
        counters: 0, monthBytes: 9_000 * GB, dayBytes: 100 * GB,
        monthKey: "2026-08-01", dayKey: "2026-08-31", at: T0, changedAt: null,
      },
      watch: {},
      counters: 0,
      wanInterface: null,
      active: [],
      at: new Date("2026-09-01T00:05:00.000Z"),
    });
    assert.equal(out.state.monthBytes, 0);
    assert.equal(out.state.monthKey, "2026-09-01");
    assert.equal(out.limit, "0/0");
  });
});
