import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accumulate,
  cycleStart,
  formatBytes,
  mbpsToKbps,
  quotaVerdict,
  zoneQueuePlan,
  pcqTypeName,
  type UsageAccumulator,
} from "./link-usage";

const GB = 1024 * 1024 * 1024;
const vide: UsageAccumulator = { usedBytes: 0, lastRaw: 0, cycleStartedAt: null };

describe("cycle de facturation", () => {
  it("prend le jour de facturation de ce mois s'il est passé", () => {
    const s = cycleStart(new Date("2026-09-20T10:00:00Z"), 5);
    assert.equal(s.toISOString(), "2026-09-05T00:00:00.000Z");
  });
  it("recule au mois précédent si le jour n'est pas encore atteint", () => {
    const s = cycleStart(new Date("2026-09-03T10:00:00Z"), 5);
    assert.equal(s.toISOString(), "2026-08-05T00:00:00.000Z");
  });
  it("borne à 28 pour exister en février", () => {
    const s = cycleStart(new Date("2026-02-15T00:00:00Z"), 31);
    assert.equal(s.toISOString(), "2026-02-28T00:00:00.000Z" > "2026-02-15" ? "2026-01-28T00:00:00.000Z" : s.toISOString());
  });
});

describe("accumulateur de conso", () => {
  it("additionne les écarts entre deux relevés", () => {
    const now = new Date("2026-09-10T10:00:00Z");
    let a = accumulate(vide, 2 * GB, now, 1);
    assert.equal(a.usedBytes, 2 * GB); // 1er relevé après le début du cycle
    a = accumulate(a, 5 * GB, now, 1);
    assert.equal(a.usedBytes, 5 * GB); // +3 Go
    assert.equal(a.counterReset, false);
  });

  it("détecte le reboot : compteur retombé → on ajoute le relevé entier", () => {
    const now = new Date("2026-09-10T10:00:00Z");
    let a: UsageAccumulator & { rolledOver: boolean; counterReset: boolean } =
      accumulate(vide, 8 * GB, now, 1);
    // Le routeur redémarre : le compteur repart de 0, puis remonte à 1 Go.
    a = accumulate(a, 1 * GB, now, 1);
    assert.equal(a.counterReset, true);
    assert.equal(a.usedBytes, 9 * GB); // 8 déjà comptés + 1 après reboot, PAS un recul
  });

  it("repart de zéro au passage du cycle de facturation", () => {
    // Cycle démarré le 5 ; on lit le 4 du mois suivant (encore ancien cycle),
    // puis le 6 (nouveau cycle) → la conso ne cumule pas par-dessus.
    let a = accumulate(vide, 40 * GB, new Date("2026-09-30T10:00:00Z"), 5);
    assert.ok(a.usedBytes >= 40 * GB - 1);
    a = accumulate(a, 45 * GB, new Date("2026-10-05T10:00:00Z"), 5);
    assert.equal(a.rolledOver, true);
    assert.equal(a.usedBytes, 5 * GB); // seulement l'écart depuis le dernier relevé
  });
});

describe("verdict de quota", () => {
  it("illimité quand aucun quota", () => {
    const v = quotaVerdict(10 * GB, null);
    assert.equal(v.state, "unlimited");
    assert.equal(v.pct, 0);
  });
  it("ok / warn / over selon les seuils", () => {
    assert.equal(quotaVerdict(40 * GB, 100 * 1024).state, "ok"); // 40 %
    assert.equal(quotaVerdict(85 * GB, 100 * 1024).state, "warn"); // 85 %
    assert.equal(quotaVerdict(120 * GB, 100 * 1024).state, "over"); // 120 %
  });
});

describe("formats", () => {
  it("octets → Mo/Go lisibles", () => {
    assert.equal(formatBytes(500 * 1024 * 1024), "500 Mo");
    assert.equal(formatBytes(12.34 * GB), "12.3 Go");
  });
  it("Mbit/s → kbit/s", () => {
    assert.equal(mbpsToKbps(5), 5000);
    assert.equal(mbpsToKbps(0), null);
    assert.equal(mbpsToKbps(null), null);
  });
});

describe("plan de files de zone (VLAN + par client)", () => {
  it("rien à poser sans plafond ni débit par client", () => {
    assert.deepEqual(zoneQueuePlan(null, null, "HOTSPOT"), { kind: "none" });
    assert.deepEqual(zoneQueuePlan(0, 0, "HOTSPOT"), { kind: "none" });
  });

  it("plafond agrégé seul : file simple, pas de PCQ", () => {
    const p = zoneQueuePlan(50000, null, "HOTSPOT");
    assert.equal(p.kind, "simple");
    if (p.kind !== "simple") return;
    assert.equal(p.maxLimit, "50000k/50000k");
    assert.equal(p.pcq, null);
  });

  it("débit par client seul : agrégat illimité + PCQ par sens", () => {
    const p = zoneQueuePlan(null, 2000, "HOTSPOT");
    if (p.kind !== "simple") return assert.fail("attendu simple");
    assert.equal(p.maxLimit, "0/0"); // pas de plafond agrégé
    assert.deepEqual(p.pcq, { up: pcqTypeName("HOTSPOT", "up"), dn: pcqTypeName("HOTSPOT", "dn"), rateKbps: 2000 });
  });

  it("les deux : plafond du VLAN ET PCQ par client", () => {
    const p = zoneQueuePlan(50000, 2000, "ZONE-A");
    if (p.kind !== "simple") return assert.fail("attendu simple");
    assert.equal(p.maxLimit, "50000k/50000k");
    assert.equal(p.pcq?.rateKbps, 2000);
    // Les types PCQ sont nommés par zone → deux zones ne partagent pas leur cap.
    assert.equal(p.pcq?.up, "SLH-pcq-ZONE-A-up");
    assert.notEqual(pcqTypeName("ZONE-A", "up"), pcqTypeName("ZONE-B", "up"));
  });
});
