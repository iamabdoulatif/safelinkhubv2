import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findDanglingHotspotUserProfileRepairs,
  selectRecoverableHotspotSessions,
  selectMikhmonSchedulers,
  type BackupSection,
} from "./router-backup";

/**
 * Le balayage d'expiration est ce qui fait qu'un ticket restauré finit par
 * mourir. Le tri est fait au nom (chez MikHmon un balayage porte le nom de son
 * profil), et c'est un filtre qu'on ne peut pas se permettre de rater dans les
 * deux sens : trop large, on rejoue des jobs de l'auto-setup ou des jobs à usage
 * unique périmés ; trop étroit, les tickets restent valides pour toujours.
 */
describe("balayages d'expiration MikHmon à restaurer", () => {
  const profiles: BackupSection = [
    { name: "01-JOUR" },
    { name: "01-MOIS" },
    { name: "default" },
  ];

  it("retient le balayage nommé comme un profil de la sauvegarde", () => {
    const schedulers: BackupSection = [
      { name: "01-JOUR", interval: "2m24s", "on-event": ':foreach i in [ /ip hotspot user find where profile="01-JOUR" ]' },
      { name: "01-MOIS", interval: "2m21s", "on-event": ':foreach i in [ /ip hotspot user find where profile="01-MOIS" ]' },
    ];
    assert.deepEqual(
      selectMikhmonSchedulers(schedulers, profiles).map((r) => r.name),
      ["01-JOUR", "01-MOIS"],
    );
  });

  it("écarte les jobs de l'auto-setup — il les repose lui-même", () => {
    const schedulers: BackupSection = [
      { name: "MIKHMON_BOOT", interval: "45s" },
      { name: "CLEAN_JOB", interval: "1d" },
      { name: "01-JOUR", interval: "2m24s" },
    ];
    assert.deepEqual(
      selectMikhmonSchedulers(schedulers, profiles).map((r) => r.name),
      ["01-JOUR"],
    );
  });

  /**
   * L'on-login pose un job à usage unique nommé d'après l'UTILISATEUR, et le
   * supprime 5 s plus tard. Une capture tombée pile dans cette fenêtre en
   * attrape un : le rejouer recréerait un job d'expiration fantôme.
   */
  it("écarte le job à usage unique d'un utilisateur surpris par la capture", () => {
    const schedulers: BackupSection = [
      { name: "vc8kd92", interval: "1d", "start-date": "jul/17/2026" },
      { name: "01-JOUR", interval: "2m24s" },
    ];
    assert.deepEqual(
      selectMikhmonSchedulers(schedulers, profiles).map((r) => r.name),
      ["01-JOUR"],
    );
  });

  /**
   * Un profil que l'admin s'est créé à la main dans MikHmon (« 02-JOURS ») a
   * son balayage comme les autres : le tri ne doit rien présumer des 6 presets
   * fournis par l'auto-setup.
   */
  it("retient le balayage d'un profil personnalisé", () => {
    const schedulers: BackupSection = [{ name: "02-JOURS", interval: "2m30s" }];
    assert.deepEqual(
      selectMikhmonSchedulers(schedulers, [{ name: "02-JOURS" }]).map((r) => r.name),
      ["02-JOURS"],
    );
  });

  it("écarte « default » — RouterOS le livre, il n'a pas de balayage", () => {
    const schedulers: BackupSection = [{ name: "default", interval: "2m24s" }];
    assert.deepEqual(selectMikhmonSchedulers(schedulers, profiles), []);
  });

  it("un routeur sans profil ne rapatrie aucun balayage", () => {
    const schedulers: BackupSection = [{ name: "01-JOUR", interval: "2m24s" }];
    assert.deepEqual(selectMikhmonSchedulers(schedulers, []), []);
  });
});

describe("réparation des liens ticket → profil après restauration", () => {
  const backupProfiles: BackupSection = [
    { ".id": "*1", name: "01-JOUR" },
    { ".id": "*2", name: "01-MOIS" },
  ];
  const targetProfiles: BackupSection = [
    { ".id": "*A", name: "default" },
    { ".id": "*B", name: "01-JOUR" },
    { ".id": "*C", name: "01-MOIS" },
  ];

  it("réattache seulement les tickets dont la référence de profil est devenue orpheline", () => {
    const repairs = findDanglingHotspotUserProfileRepairs(
      [
        { name: "ticket-jour", profile: "01-JOUR" },
        { name: "ticket-mois", profile: "*2" },
        // Une modification manuelle valide sur la cible ne doit jamais être
        // écrasée par une restauration relancée.
        { name: "ticket-modifie", profile: "01-JOUR" },
        // Un compte livré par RouterOS n'est pas un ticket à restaurer.
        { name: "admin", profile: "default", default: "true" },
      ],
      backupProfiles,
      [
        { ".id": "*10", name: "ticket-jour", profile: "*1" },
        { ".id": "*11", name: "ticket-mois", profile: "*2" },
        { ".id": "*12", name: "ticket-modifie", profile: "01-MOIS" },
        { ".id": "*13", name: "admin", profile: "*1" },
      ],
      targetProfiles,
    );

    assert.deepEqual(repairs, [
      { id: "*10", name: "ticket-jour", profile: "01-JOUR" },
      { id: "*11", name: "ticket-mois", profile: "01-MOIS" },
    ]);
  });

  it("laisse intact un ticket sans profil source ou dont le profil attendu est absent de la cible", () => {
    const repairs = findDanglingHotspotUserProfileRepairs(
      [
        { name: "profil-supprime", profile: "ANCIEN-PROFIL" },
        { name: "un-autre-ticket", profile: "01-JOUR" },
      ],
      backupProfiles,
      [
        { ".id": "*10", name: "profil-supprime", profile: "*1" },
        { ".id": "*11", name: "hors-sauvegarde", profile: "*2" },
      ],
      targetProfiles,
    );

    assert.deepEqual(repairs, []);
  });
});

describe("reprise des sessions Hotspot actives", () => {
  it("ne retient que les appareils actifs dont le ticket a une expiration sûre", () => {
    const sessions = selectRecoverableHotspotSessions(
      [
        { user: "ticket-actif", "mac-address": "aa-bb-cc-dd-ee-ff" },
        { user: "ticket-expire", "mac-address": "11:22:33:44:55:66" },
        { user: "ticket-sans-date", "mac-address": "22:33:44:55:66:77" },
      ],
      [
        { ".id": "*1", name: "01-JOUR" },
        { ".id": "*2", name: "01-MOIS" },
      ],
      [
        { name: "ticket-actif", profile: "*1", comment: "aug/12/2026 12:00:00 debut aug/11/2026 12:00:00" },
        { name: "ticket-expire", profile: "01-MOIS", comment: "aug/10/2026 12:00:00" },
        { name: "ticket-sans-date", profile: "01-JOUR", comment: "vente en attente" },
      ],
      [{ name: "01-JOUR" }, { name: "01-MOIS" }],
      new Date("2026-08-11T10:00:00Z"),
    );

    assert.deepEqual(sessions, [
      {
        username: "ticket-actif",
        macAddress: "AA:BB:CC:DD:EE:FF",
        profile: "01-JOUR",
        comment: "aug/12/2026 12:00:00 debut aug/11/2026 12:00:00",
        expiresOn: "aug/12/2026",
        expiresAt: "12:00:00",
      },
    ]);
  });

  it("écarte un MAC ambigu plutôt que de donner un accès au mauvais ticket", () => {
    const sessions = selectRecoverableHotspotSessions(
      [
        { user: "ticket-a", "mac-address": "AA:BB:CC:DD:EE:FF" },
        { user: "ticket-b", "mac-address": "AA:BB:CC:DD:EE:FF" },
      ],
      [{ name: "01-JOUR" }],
      [
        { name: "ticket-a", profile: "01-JOUR", comment: "aug/12/2026 12:00:00" },
        { name: "ticket-b", profile: "01-JOUR", comment: "aug/12/2026 12:00:00" },
      ],
      [{ name: "01-JOUR" }],
      new Date("2026-08-11T10:00:00Z"),
    );

    assert.deepEqual(sessions, []);
  });
});
