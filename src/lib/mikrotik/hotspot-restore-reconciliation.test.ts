import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prepareHotspotRestore } from "./hotspot-restore-reconciliation";

describe("pré-vol des liaisons HotSpot restaurées", () => {
  const sourceProfiles = [
    { ".id": "*1", name: "05-JOURS", "address-pool": "*1", "parent-queue": "*2" },
    { ".id": "*2", name: "01-MOIS" },
  ];
  const targetProfiles = [
    { ".id": "*A", name: "default", "address-pool": "POOL-HOTSPOT" },
    { ".id": "*B", name: "05-JOURS", "address-pool": "*1", "parent-queue": "local-parent" },
    { ".id": "*C", name: "01-MOIS", "address-pool": "POOL-HOTSPOT", "parent-queue": "*2" },
  ];

  it("traduit les références internes de profil et de serveur vers la cible", () => {
    const plan = prepareHotspotRestore({
      sourceProfiles,
      sourceTickets: [
        {
          name: "5jyw82",
          password: "5jyw82",
          profile: "*1",
          server: "hotspot-source",
          comment: "aug/12/2026 12:00:00",
        },
      ],
      targetProfiles,
      targetServers: [{ name: "hotspot1", disabled: "false", "address-pool": "POOL-HOTSPOT" }],
    });

    assert.deepEqual(plan.blockers, []);
    assert.deepEqual(plan.tickets, [
      {
        name: "5jyw82",
        profile: "05-JOURS",
        server: "hotspot1",
        fields: {
          name: "5jyw82",
          password: "5jyw82",
          profile: "05-JOURS",
          server: "hotspot1",
          comment: "aug/12/2026 12:00:00",
        },
      },
    ]);
    assert.deepEqual(plan.profileBindings, [
      { name: "05-JOURS", addressPool: "POOL-HOTSPOT", parentQueue: "local-parent" },
      { name: "01-MOIS", addressPool: "POOL-HOTSPOT", parentQueue: "none" },
    ]);
    assert.deepEqual(plan.parentQueueAdaptations, ["01-MOIS"]);
  });

  it("bloque chaque référence qui ne peut pas être traduite avant de préparer un ticket", () => {
    const plan = prepareHotspotRestore({
      sourceProfiles,
      sourceTickets: [
        { name: "profil-inconnu", profile: "*99", server: "hotspot-source" },
        { name: "sans-profil", server: "hotspot-source" },
      ],
      targetProfiles,
      targetServers: [{ name: "hotspot1", disabled: "false", "address-pool": "POOL-HOTSPOT" }],
    });

    assert.equal(plan.tickets.length, 0);
    assert.equal(plan.blockers.length, 2);
    assert.ok(plan.blockers.some((message) => message.includes("profil-inconnu")));
    assert.ok(plan.blockers.some((message) => message.includes("sans-profil")));
  });

  it("bloque une cible sans serveur HotSpot unique et sans pool IP", () => {
    const noServer = prepareHotspotRestore({
      sourceProfiles,
      sourceTickets: [{ name: "ticket", profile: "05-JOURS" }],
      targetProfiles,
      targetServers: [],
    });
    const manyServers = prepareHotspotRestore({
      sourceProfiles,
      sourceTickets: [{ name: "ticket", profile: "05-JOURS" }],
      targetProfiles,
      targetServers: [
        { name: "hotspot1", disabled: "false", "address-pool": "POOL-HOTSPOT" },
        { name: "hotspot2", disabled: "false", "address-pool": "POOL-2" },
      ],
    });
    const noPool = prepareHotspotRestore({
      sourceProfiles,
      sourceTickets: [{ name: "ticket", profile: "05-JOURS" }],
      targetProfiles,
      targetServers: [{ name: "hotspot1", disabled: "false", "address-pool": "" }],
    });

    assert.ok(noServer.blockers.some((message) => message.includes("exactement un")));
    assert.ok(manyServers.blockers.some((message) => message.includes("exactement un")));
    assert.ok(noPool.blockers.some((message) => message.includes("pool IP")));
  });

  it("bloque les profils absents de la cible après leur synchronisation", () => {
    const plan = prepareHotspotRestore({
      sourceProfiles,
      sourceTickets: [{ name: "ticket-mois", profile: "*2", server: "hotspot-source" }],
      targetProfiles: targetProfiles.filter((profile) => profile.name !== "01-MOIS"),
      targetServers: [{ name: "hotspot1", disabled: "false", "address-pool": "POOL-HOTSPOT" }],
    });

    assert.equal(plan.tickets.length, 0);
    assert.ok(plan.blockers.some((message) => message.includes("01-MOIS")));
  });
});
