import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  binaryBackupRestoreGuard,
  resetBinaryBackupRestoreConfirmation,
} from "./binary-backup-restore-guard";

describe("binaryBackupRestoreGuard", () => {
  it("refuse un clonage binaire sans confirmation de compatibilité", () => {
    assert.equal(binaryBackupRestoreGuard(false).ok, false);
  });

  it("autorise le chargement seulement après confirmation même appareil et même RouterOS", () => {
    assert.deepEqual(binaryBackupRestoreGuard(true), { ok: true });
  });

  it("réinitialise la confirmation lorsqu'on change de routeur cible ou annule", () => {
    assert.deepEqual(resetBinaryBackupRestoreConfirmation(), {
      confirming: false,
      sameDeviceAndRouterOsConfirmed: false,
    });
  });
});
