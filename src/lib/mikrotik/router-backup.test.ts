import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectMikhmonSchedulers, type BackupSection } from "./router-backup";

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
