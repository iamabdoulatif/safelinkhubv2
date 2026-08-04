import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRestorePlan, type HardwareScan } from "./router-preflight";
import type { BackupSnapshot } from "./router-backup";

function snapshot(over: {
  model?: string | null;
  identity?: string | null;
  ssid?: string | null;
  wifiApi?: "wifi" | "wireless" | "none";
  ethernet?: number;
  tickets?: number;
  portal?: BackupSnapshot["portal"];
}): BackupSnapshot {
  return {
    version: 1,
    capturedAt: "2026-07-17T00:00:00.000Z",
    router: {
      name: "ancien",
      model: over.model ?? "RB951Ui-2HnD",
      rosVersion: "7.16.1",
      serialNumber: "ABC",
      identity: over.identity ?? "RUE-NICOLAS",
    },
    identity: {
      wifiApi: over.wifiApi ?? "wireless",
      ssid: over.ssid ?? "YAHYA WIFI",
      hotspotDnsName: "yahya.ci",
      hotspotServerName: "hotspot1",
    },
    portal:
      over.portal === undefined
        ? { htmlDirectory: "hotspot1-portal", templateId: "tpl-1", templateName: "safelinkhub-gold" }
        : over.portal,
    sections: {
      hotspotUsers: Array.from({ length: over.tickets ?? 1330 }, (_, i) => ({ name: `t${i}` })),
      hotspotUserProfiles: [{ name: "01-JOUR" }],
      walledGarden: [{ "dst-host": "safelinkhub.io" }],
      ethernet: Array.from({ length: over.ethernet ?? 5 }, (_, i) => ({ name: `ether${i + 1}` })),
    },
    warnings: [],
  };
}

function scan(over: Partial<HardwareScan>): HardwareScan {
  return {
    model: "hAP ax²",
    architecture: "arm",
    rosVersion: "7.20",
    serialNumber: "XYZ",
    identity: "MikroTik",
    ethernet: [{ name: "ether1", running: true }, { name: "ether2", running: false }],
    wifi: {
      api: "wifi",
      radios: [
        { name: "wifi1", ssid: null, band5ghz: true, disabled: false, country: null },
        { name: "wifi2", ssid: null, band5ghz: false, disabled: false, country: null },
      ],
    },
    supportsContainers: true,
    hasUsbStorage: true,
    scenario: 1,
    hasActiveHotspot: true,
    ...over,
  };
}

describe("plan de restauration — identité", () => {
  it("le rechange reprend le nom RouterOS de l'ancien", () => {
    const plan = buildRestorePlan(snapshot({}), scan({}));
    assert.equal(plan.identity.from, "MikroTik");
    assert.equal(plan.identity.to, "RUE-NICOLAS");
    assert.equal(plan.identity.willApply, true);
  });

  it("ne renomme pas quand le nom est déjà le bon (relance de restauration)", () => {
    const plan = buildRestorePlan(snapshot({}), scan({ identity: "RUE-NICOLAS" }));
    assert.equal(plan.identity.willApply, false);
  });
});

describe("plan de restauration — WiFi", () => {
  it("signale la traduction wireless → wifi et nomme les radios visées", () => {
    const plan = buildRestorePlan(snapshot({ wifiApi: "wireless" }), scan({}));
    assert.equal(plan.wifi.translated, true);
    assert.deepEqual(plan.wifi.radios, ["wifi1", "wifi2"]);
    assert.ok(plan.adjustments.some((a) => a.includes("traduit") && a.includes("YAHYA WIFI")));
  });

  it("même API : aucune traduction annoncée", () => {
    const plan = buildRestorePlan(snapshot({ wifiApi: "wifi" }), scan({}));
    assert.equal(plan.wifi.translated, false);
  });

  /** RB4011iGS+ : aucune radio. Ce n'est pas un blocage — le hotspot filaire marche. */
  it("rechange sans radio : ajustement signalé, pas un blocage", () => {
    const plan = buildRestorePlan(
      snapshot({}),
      scan({ wifi: { api: "none", radios: [] } }),
    );
    assert.equal(plan.wifi.radios.length, 0);
    assert.equal(plan.blockers.length, 0);
    assert.ok(plan.adjustments.some((a) => a.includes("AUCUNE radio")));
  });
});

describe("plan de restauration — MikHmon selon l'architecture", () => {
  /**
   * Le cas qui fait mal : hAP ax (ARM, container) remplacé par un RB951
   * (mipsbe). Les tickets se restaurent, mais MikHmon ne tournera JAMAIS —
   * RouterOS ne supporte pas les containers sur mipsbe. Doit bloquer.
   */
  it("BLOQUE quand on descend d'une board container vers une mipsbe", () => {
    const plan = buildRestorePlan(
      snapshot({ model: "hAP ax²" }),
      scan({ model: "RB951Ui-2HnD", architecture: "mipsbe", supportsContainers: false, scenario: 4 }),
    );
    assert.equal(plan.blockers.length, 1);
    assert.ok(plan.blockers[0].includes("containers"));
  });

  it("RB951 → hAP ax : montée en gamme signalée, aucun blocage", () => {
    const plan = buildRestorePlan(snapshot({ model: "RB951Ui-2HnD" }), scan({}));
    assert.equal(plan.blockers.length, 0);
    assert.ok(plan.adjustments.some((a) => a.includes("supporte les containers")));
  });

  it("prévient que sans clé USB MikHmon vit en RAM et ne survit pas au reboot", () => {
    const plan = buildRestorePlan(snapshot({}), scan({ hasUsbStorage: false, scenario: 2 }));
    assert.ok(plan.adjustments.some((a) => a.includes("tmpfs")));
  });
});

describe("plan de restauration — pré-requis et ports", () => {
  it("BLOQUE si le rechange n'a pas de hotspot (les tickets n'iraient nulle part)", () => {
    const plan = buildRestorePlan(snapshot({}), scan({ hasActiveHotspot: false }));
    assert.ok(plan.blockers.some((b) => b.includes("auto-setup")));
  });

  it("signale un rechange avec moins de prises", () => {
    const plan = buildRestorePlan(snapshot({ ethernet: 10 }), scan({}));
    assert.equal(plan.ports.source, 10);
    assert.equal(plan.ports.target, 2);
    assert.equal(plan.ports.delta, -8);
    assert.ok(plan.adjustments.some((a) => a.includes("port(s) Ethernet")));
  });

  it("plus de prises que l'ancien : rien à signaler", () => {
    const plan = buildRestorePlan(snapshot({ ethernet: 2 }), scan({}));
    assert.ok(!plan.adjustments.some((a) => a.includes("port(s) Ethernet")));
  });

  /** Sauvegarde d'avant la section "ethernet" : ne pas inventer d'écart. */
  it("ancienne sauvegarde sans section ethernet : aucun écart inventé", () => {
    const snap = snapshot({});
    delete snap.sections.ethernet;
    const plan = buildRestorePlan(snap, scan({}));
    assert.equal(plan.ports.source, 0);
    assert.ok(!plan.adjustments.some((a) => a.includes("port(s) Ethernet")));
  });

  /**
   * Les fichiers du portail vivent sur la flash, pas dans la sauvegarde : sans
   * réinstallation, le rechange sert la page de connexion RouterOS par défaut —
   * ni forfaits, ni paiement. Le plan doit donc l'annoncer.
   */
  it("annonce la réinstallation du portail mémorisé", () => {
    const plan = buildRestorePlan(snapshot({}), scan({}));
    assert.equal(plan.portal.willReinstall, true);
    assert.equal(plan.portal.templateId, "tpl-1");
    assert.ok(plan.adjustments.some((a) => a.includes("safelinkhub-gold")));
  });

  it("aucun modèle mémorisé : prévient que le portail devra être installé à la main", () => {
    const plan = buildRestorePlan(
      snapshot({ portal: { htmlDirectory: null, templateId: null, templateName: null } }),
      scan({}),
    );
    assert.equal(plan.portal.willReinstall, false);
    assert.ok(plan.adjustments.some((a) => a.includes("RouterOS par défaut")));
  });

  it("compte les données à restaurer", () => {
    const plan = buildRestorePlan(snapshot({ tickets: 4867 }), scan({}));
    assert.equal(plan.data.tickets, 4867);
    assert.equal(plan.data.profiles, 1);
  });
});
