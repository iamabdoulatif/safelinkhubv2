import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isRouterOsBackup,
  looksEncrypted,
  inspectRouterOsBackup,
  ROUTEROS_BACKUP_MAGIC,
  MAX_BACKUP_BYTES,
} from "./routeros-backup-file";

// En-tête réel observé sur svge-1.backup, suivi de noms de sections en clair.
function fakeUnencryptedBackup(): Uint8Array {
  const head = Uint8Array.from([...ROUTEROS_BACKUP_MAGIC, 0xa6, 0x19, 0x23, 0x00]);
  const body = new TextEncoder().encode("\x00\x00r5/version\x00net/vrf\x00misc/\x00main");
  return Uint8Array.from([...head, ...body]);
}

describe("routeros-backup-file", () => {
  it("reconnaît le magic RouterOS 0x88 0xAC 0xA1 0xB1", () => {
    assert.equal(isRouterOsBackup(fakeUnencryptedBackup()), true);
  });

  it("rejette un fichier .rsc (texte) et une pièce arbitraire", () => {
    const rsc = new TextEncoder().encode("/interface wireguard add name=wg0\n");
    assert.equal(isRouterOsBackup(rsc), false);
    assert.equal(inspectRouterOsBackup(rsc).valid, false);
  });

  it("détecte un backup NON chiffré via les noms de sections en clair", () => {
    assert.equal(looksEncrypted(fakeUnencryptedBackup()), false);
    assert.equal(inspectRouterOsBackup(fakeUnencryptedBackup()).encrypted, false);
  });

  it("flag « chiffré » quand aucun marqueur en clair après l'en-tête", () => {
    const scrambled = Uint8Array.from([...ROUTEROS_BACKUP_MAGIC, ...Array(512).fill(0xff)]);
    assert.equal(looksEncrypted(scrambled), true);
  });

  it("refuse un fichier vide et un fichier hors limite de taille", () => {
    assert.equal(inspectRouterOsBackup(new Uint8Array(0)).valid, false);
    const tooBig = { length: MAX_BACKUP_BYTES + 1 } as unknown as Uint8Array;
    // inspect ne lit que .length pour la borne de taille avant tout accès octet
    assert.equal(inspectRouterOsBackup(tooBig).valid, false);
  });

  it("valide un backup bien formé et renvoie sa taille", () => {
    const buf = fakeUnencryptedBackup();
    const res = inspectRouterOsBackup(buf);
    assert.equal(res.valid, true);
    assert.equal(res.sizeBytes, buf.length);
  });
});
