import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTopologyChannels, type BackupLike, type PlanLike } from "./restore-topology-model";

const backup: BackupLike = {
  routerName: "RUE-NICOLAS",
  model: "RB951Ui-2HnD",
  counts: { hotspotUsers: 1330, hotspotUserProfiles: 11 },
};

function plan(over: Partial<PlanLike> = {}): PlanLike {
  return {
    identity: { from: "MikroTik", to: "RUE-NICOLAS", willApply: true },
    wifi: {
      ssid: "YAHYA WIFI",
      sourceApi: "wireless",
      targetApi: "wifi",
      radios: ["wifi1", "wifi2"],
      translated: true,
    },
    data: { tickets: 1330, profiles: 11, walledGarden: 32 },
    hotspot: { server: "hotspot1", addressPool: "POOL-HOTSPOT", validated: true },
    portal: { templateId: "tpl-1", templateName: "safelinkhub-gold", willReinstall: true },
    blockers: [],
    ...over,
  };
}

const byKey = (chans: ReturnType<typeof buildTopologyChannels>, k: string) =>
  chans.find((c) => c.key === k)!;

describe("topologie — avant le scan", () => {
  /** Rien n'a encore été lu sur le matériel : n'affirmer aucun état. */
  it("tous les canaux sont en attente, sans rien affirmer", () => {
    const chans = buildTopologyChannels(backup, null, "idle");
    assert.equal(chans.length, 4);
    assert.ok(chans.every((c) => c.state === "idle"));
    // \s et pas une espace littérale : Intl sépare les milliers par une espace
    // fine insécable (U+202F), invisible à la relecture d'un test.
    assert.match(byKey(chans, "data").detail, /1\s330 tickets/u);
  });
});

describe("topologie — après le scan", () => {
  it("annonce les canaux comme prévus, pas comme faits", () => {
    const chans = buildTopologyChannels(backup, plan(), "planned");
    assert.ok(chans.every((c) => c.state === "planned"));
    assert.ok(byKey(chans, "wifi").detail.includes("wireless → wifi"));
    assert.ok(byKey(chans, "identity").detail.includes("MikroTik → RUE-NICOLAS"));
  });

  it("expose le serveur HotSpot et le pool cible validés pour les tickets", () => {
    const chans = buildTopologyChannels(
      backup,
      {
        ...plan(),
        hotspot: { server: "hotspot1", addressPool: "POOL-HOTSPOT", validated: true },
      },
      "planned",
    );

    assert.match(byKey(chans, "data").detail, /hotspot1.*POOL-HOTSPOT/u);
  });

  it("reste lisible pour un plan de job enregistré avant la liaison HotSpot", () => {
    const { hotspot: _hotspot, ...legacyPlan } = plan();
    const chans = buildTopologyChannels(backup, legacyPlan, "planned");

    assert.ok(byKey(chans, "data").detail.includes("liaison HotSpot non validée"));
  });

  /**
   * Le mensonge à ne jamais commettre sur cet écran : une simulation n'écrit
   * rien, donc ses canaux restent « prévus ». Seule une restauration réelle
   * passe en « repris ».
   */
  it("une simulation ne marque JAMAIS un canal comme repris", () => {
    const chans = buildTopologyChannels(backup, plan(), "planned");
    assert.equal(chans.filter((c) => c.state === "done").length, 0);
  });

  it("après restauration réelle, les canaux passent en repris", () => {
    const chans = buildTopologyChannels(backup, plan(), "done");
    assert.equal(byKey(chans, "data").state, "done");
    assert.equal(byKey(chans, "portal").state, "done");
  });

  it("une restauration interrompue n'est jamais affichée comme terminée", () => {
    const chans = buildTopologyChannels(backup, plan(), "failed");
    assert.equal(byKey(chans, "data").state, "failed");
  });

  it("un blocage bloque TOUS les canaux : rien n'est écrit tant qu'il tient", () => {
    const chans = buildTopologyChannels(backup, plan({ blockers: ["pas de hotspot"] }), "planned");
    assert.ok(chans.every((c) => c.state === "blocked"));
  });
});

describe("topologie — cas matériels", () => {
  it("rechange sans radio : le canal WiFi est sans objet, pas bloqué", () => {
    const chans = buildTopologyChannels(
      backup,
      plan({ wifi: { ssid: "X", sourceApi: "wireless", targetApi: "none", radios: [], translated: false } }),
      "planned",
    );
    assert.equal(byKey(chans, "wifi").state, "skipped");
    assert.ok(byKey(chans, "wifi").detail.includes("aucune radio"));
    // Le reste de la reprise continue.
    assert.equal(byKey(chans, "data").state, "planned");
  });

  it("portail inconnu : canal sans objet et consigne explicite", () => {
    const chans = buildTopologyChannels(
      backup,
      plan({ portal: { templateId: null, templateName: null, willReinstall: false } }),
      "planned",
    );
    assert.equal(byKey(chans, "portal").state, "skipped");
    assert.ok(byKey(chans, "portal").detail.includes("à installer à la main"));
  });

  it("nom déjà correct (relance) : l'identité est sans objet", () => {
    const chans = buildTopologyChannels(
      backup,
      plan({ identity: { from: "RUE-NICOLAS", to: "RUE-NICOLAS", willApply: false } }),
      "planned",
    );
    assert.equal(byKey(chans, "identity").state, "skipped");
    assert.ok(byKey(chans, "identity").detail.includes("déjà"));
  });
});
