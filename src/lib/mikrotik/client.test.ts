import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Duplex } from "stream";
import { RouterOSClient } from "./client";

// --- encodage protocole RouterOS (côté "routeur" simulé) --------------------

function encodeLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  if (length < 0x4000) {
    const buf = Buffer.alloc(2);
    buf.writeUInt16BE(length | 0x8000, 0);
    return buf;
  }
  const buf = Buffer.alloc(4);
  buf[0] = (length >> 24) | 0xe0;
  buf.writeUIntBE(length & 0xffffff, 1, 3);
  return buf;
}

function encodeSentence(words: string[]): Buffer {
  return Buffer.concat([
    ...words.map((w) => {
      const b = Buffer.from(w, "utf8");
      return Buffer.concat([encodeLength(b.length), b]);
    }),
    Buffer.from([0]),
  ]);
}

/**
 * Routeur simulé : répond au /login, puis à toute commande par `rowCount`
 * phrases !re suivies d'un !done — le tout débité en petits chunks pour imiter
 * la fragmentation TCP d'une grosse réponse.
 */
function fakeRouter(rowCount: number, chunkSize: number) {
  const stream = new Duplex({
    read() {},
    write(chunk, _enc, cb) {
      const text = Buffer.from(chunk).toString("utf8");
      const reply = text.includes("/login")
        ? encodeSentence(["!done"])
        : Buffer.concat([
            ...Array.from({ length: rowCount }, (_, i) =>
              encodeSentence(["!re", `=.id=*${i}`, `=name=ticket-${i}`, `=password=pw-${i}`]),
            ),
            encodeSentence(["!done"]),
          ]);
      // Débit en chunks : c'est précisément ce découpage qui faisait perdre des
      // données quand le listener "data" était retiré entre deux phrases.
      for (let off = 0; off < reply.length; off += chunkSize) {
        stream.push(reply.subarray(off, off + chunkSize));
      }
      cb();
    },
  });
  return stream;
}

describe("RouterOSClient.talk — grosses réponses", () => {
  /**
   * Régression : readSentence attachait/détachait un listener "data" par
   * phrase. Retirer un listener "data" ne repasse PAS un flux Node en pause, si
   * bien que les chunks arrivant entre deux phrases étaient émis sans personne
   * pour les lire, et perdus. Constaté en production : la lecture des 4 869
   * tickets d'un hotspot rendait 2 874, 3 057 ou 3 342 lignes — un nombre
   * différent à chaque appel, avec des trous au milieu et quelques lignes
   * corrompues, sans jamais lever d'erreur. Une sauvegarde silencieusement
   * amputée de 30 % des tickets vendus est pire que pas de sauvegarde.
   */
  it("rend TOUTES les lignes d'une réponse fragmentée en de nombreux chunks", async () => {
    const client = new RouterOSClient();
    await client.connectViaStream(fakeRouter(5000, 64), "u", "p", 5000);

    const rows = await client.talk(["/ip/hotspot/user/print"], 5000);

    assert.equal(rows.length, 5000);
    // Ni trou, ni doublon, ni ligne corrompue : l'ordre et le contenu exacts.
    assert.equal(rows[0].name, "ticket-0");
    assert.equal(rows[4999].name, "ticket-4999");
    assert.equal(new Set(rows.map((r) => r.name)).size, 5000);
    assert.ok(rows.every((r, i) => r.password === `pw-${i}`));
  });

  it("reste correct quand chaque chunk coupe au milieu d'un mot", async () => {
    const client = new RouterOSClient();
    // 3 octets par chunk : les préfixes de longueur eux-mêmes sont scindés.
    await client.connectViaStream(fakeRouter(200, 3), "u", "p", 5000);

    const rows = await client.talk(["/ip/hotspot/user/print"], 5000);

    assert.equal(rows.length, 200);
    assert.equal(rows[199].name, "ticket-199");
  });

  it("sert plusieurs phrases contenues dans un seul chunk", async () => {
    const client = new RouterOSClient();
    // Chunk géant : toute la réponse arrive d'un bloc, avant même le 1er read.
    await client.connectViaStream(fakeRouter(50, 1_000_000), "u", "p", 5000);

    const rows = await client.talk(["/ip/hotspot/user/print"], 5000);

    assert.equal(rows.length, 50);
  });
});
