import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import {
  binaryBackupRestoreGuard,
  binaryBackupVersionVerdict,
  classifyBackupLoadOutcome,
  compareRouterOsVersions,
  parseRouterOsVersion,
  resetBinaryBackupRestoreConfirmation,
} from "./binary-backup-restore-guard";

describe("binaryBackupRestoreGuard", () => {
  it("refuse un clonage binaire sans confirmation « même appareil »", () => {
    assert.equal(binaryBackupRestoreGuard({ sameDeviceConfirmed: false }).ok, false);
  });

  it("autorise après confirmation, même sans version déclarée", () => {
    assert.equal(binaryBackupRestoreGuard({ sameDeviceConfirmed: true }).ok, true);
  });

  it("réinitialise la confirmation lorsqu'on change de routeur cible ou annule", () => {
    assert.deepEqual(resetBinaryBackupRestoreConfirmation(), {
      confirming: false,
      sameDeviceConfirmed: false,
    });
  });
});

describe("lecture d'une version RouterOS", () => {
  it("comprend les formes réellement rendues par /system/resource", () => {
    assert.deepEqual(parseRouterOsVersion("7.24"), { major: 7, minor: 24, patch: 0 });
    assert.deepEqual(parseRouterOsVersion("7.8"), { major: 7, minor: 8, patch: 0 });
    assert.deepEqual(parseRouterOsVersion("6.49.10 (long-term)"), {
      major: 6,
      minor: 49,
      patch: 10,
    });
    assert.deepEqual(parseRouterOsVersion("7.24rc3"), { major: 7, minor: 24, patch: 0 });
    assert.equal(parseRouterOsVersion(""), null);
    assert.equal(parseRouterOsVersion(null), null);
  });

  it("ordonne 7.8 AVANT 7.24 — comparer en texte les inverserait", () => {
    /* « 7.8 » > « 7.24 » en tri alphabétique : c'est exactement le piège qui
       ferait déclarer la sauvegarde plus récente que le routeur. */
    const v78 = parseRouterOsVersion("7.8")!;
    const v724 = parseRouterOsVersion("7.24")!;
    assert.ok(compareRouterOsVersions(v78, v724) < 0);
    assert.ok(compareRouterOsVersions(v724, v78) > 0);
    assert.equal(compareRouterOsVersions(v78, v78), 0);
  });
});

describe("compatibilité de version d'une restauration binaire", () => {
  it("ACCEPTE une sauvegarde plus ancienne sur un routeur à jour", () => {
    /* Le cas signalé : sauvegarde prise en 7.8 sur un RB4011, routeur depuis
       passé en 7.24. RouterOS l'accepte et migre la configuration ; le SaaS le
       déclarait incompatible parce qu'il exigeait la MÊME version. */
    const v = binaryBackupVersionVerdict({ sourceVersion: "7.8", targetVersion: "7.24 (stable)" });
    assert.equal(v.kind, "ok");
    assert.equal(
      binaryBackupRestoreGuard({
        sameDeviceConfirmed: true,
        sourceVersion: "7.8",
        targetVersion: "7.24",
      }).ok,
      true,
    );
  });

  it("accepte évidemment deux versions identiques", () => {
    assert.equal(
      binaryBackupVersionVerdict({ sourceVersion: "7.24", targetVersion: "7.24" }).kind,
      "ok",
    );
  });

  it("BLOQUE une sauvegarde plus récente que le routeur", () => {
    // Le format n'est pas rétro-compatible.
    const v = binaryBackupVersionVerdict({ sourceVersion: "7.24", targetVersion: "7.8" });
    assert.equal(v.kind, "blocked");
    assert.match(v.message, /mettez d'abord le routeur à jour/i);
    assert.equal(
      binaryBackupRestoreGuard({
        sameDeviceConfirmed: true,
        sourceVersion: "7.24",
        targetVersion: "7.8",
      }).ok,
      false,
    );
  });

  it("BLOQUE le franchissement de branche majeure", () => {
    assert.equal(
      binaryBackupVersionVerdict({ sourceVersion: "6.49.10", targetVersion: "7.24" }).kind,
      "blocked",
    );
    assert.equal(
      binaryBackupVersionVerdict({ sourceVersion: "7.1", targetVersion: "6.49" }).kind,
      "blocked",
    );
  });

  it("laisse passer sans version déclarée, en énonçant la règle", () => {
    /* Le binaire RouterOS n'expose pas son numéro de version de façon lisible :
       en l'absence de déclaration on n'invente pas de verdict, mais on ne
       bloque pas non plus une opération légitime. */
    const v = binaryBackupVersionVerdict({ sourceVersion: null, targetVersion: "7.24" });
    assert.equal(v.kind, "unknown");
    assert.match(v.message, /plus récente/i);
  });
});

describe("issue d'un /system backup load", () => {
  it("lit une coupure de transport comme le redémarrage attendu", () => {
    for (const message of [
      "Read timed out",
      "Connection timed out",
      "RouterOS connection closed by peer",
      "RouterOS connection terminated",
      "read ECONNRESET",
      "Not connected",
    ]) {
      assert.deepEqual(
        classifyBackupLoadOutcome(new Error(message)),
        { rebooting: true },
        `« ${message} » est un redémarrage`,
      );
    }
    assert.deepEqual(classifyBackupLoadOutcome(null), { rebooting: true });
  });

  it("REMONTE un refus de RouterOS au lieu d'annoncer un redémarrage", () => {
    /* Avant, `.catch(() => {})` avalait tout : un fichier refusé était annoncé
       comme une réussite, avec un reboot qui n'avait jamais lieu. */
    const out = classifyBackupLoadOutcome(new Error("invalid backup file"));
    assert.equal(out.rebooting, false);
    assert.equal(out.rebooting === false && out.routerMessage, "invalid backup file");
  });
});

describe("la restauration est branchée sur la version RÉELLE de la cible", () => {
  it("lit le routeur avant de transférer, et ne confond plus refus et reboot", async () => {
    const src = await readFile(new URL("./backup-upload-actions.ts", import.meta.url), "utf8");
    const restore = src.slice(src.indexOf("export async function restoreUploadedBackup"));

    // Le verdict s'appuie sur /system/resource, pas sur une case à cocher…
    assert.match(restore, /binaryBackupVersionVerdict\(/);
    assert.match(restore, /targetVersion: resource\?\.version/);
    // …et il tranche AVANT de pousser le binaire sur le routeur.
    assert.ok(
      restore.indexOf("binaryBackupVersionVerdict(") < restore.indexOf("/tool/fetch"),
      "inutile de transférer 9 Mo vers un routeur qui refusera le chargement",
    );
    // Le refus de RouterOS n'est plus avalé.
    assert.match(restore, /classifyBackupLoadOutcome\(/);
    assert.doesNotMatch(restore, /catch\(\(\) => \{\s*\/\* reboot/);
  });

  it("l'écran ne réclame plus la même version RouterOS", async () => {
    const vue = await readFile(
      new URL("../../app/admin/router/backups/UploadedBackupsCard.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(vue, /même version RouterOS/);
    assert.match(vue, /sourceRouterOsVersion/);
  });
});
