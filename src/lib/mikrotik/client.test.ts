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

// --- décodage minimal (côté "routeur" simulé) pour relire le tag envoyé -------

function decodeWords(buf: Buffer): string[] {
  const words: string[] = [];
  let off = 0;
  while (off < buf.length) {
    let len = buf[off];
    if (len < 0x80) off += 1;
    else if ((len & 0xc0) === 0x80) {
      len = ((len & 0x3f) << 8) | buf[off + 1];
      off += 2;
    } else break;
    if (len === 0) continue;
    words.push(buf.subarray(off, off + len).toString("utf8"));
    off += len;
  }
  return words;
}

describe("RouterOSClient.talkBatch — commandes taguées", () => {
  it("attribue chaque réponse à sa commande, même hors ordre, et isole les !trap", async () => {
    // Routeur qui répond aux commandes dans l'ordre INVERSE d'arrivée, et
    // refuse tout ce qui contient « dup ».
    const stream = new Duplex({
      read() {},
      write(chunk, _enc, cb) {
        const words = decodeWords(Buffer.from(chunk));
        if (words[0] === "/login") {
          stream.push(encodeSentence(["!done"]));
        } else {
          const tag = words.find((w) => w.startsWith(".tag="))!;
          const reply = words.some((w) => w.includes("dup"))
            ? [encodeSentence(["!trap", "=message=already have user", tag]), encodeSentence(["!done", tag])]
            : [encodeSentence(["!re", `=ret=${words[1]}`, tag]), encodeSentence(["!done", tag])];
          setTimeout(() => reply.forEach((r) => stream.push(r)), 10 - Number(tag.slice(5)) * 3);
        }
        cb();
      },
    });
    const client = new RouterOSClient();
    await client.connectViaStream(stream, "admin", "pw");

    const results = await client.talkBatch(
      [
        ["/ip/hotspot/user/add", "=name=a"],
        ["/ip/hotspot/user/add", "=name=dup"],
        ["/ip/hotspot/user/add", "=name=c"],
      ],
      1000,
    );

    assert.deepEqual(
      results.map((r) => (r.status === "fulfilled" ? r.value : `KO:${(r.reason as Error).message}`)),
      [[{ ret: "=name=a" }], "KO:already have user", [{ ret: "=name=c" }]],
    );
    // La connexion reste saine : un talk() ordinaire fonctionne après la salve.
    assert.deepEqual(await client.talkBatch([["/x", "=name=z"]], 1000), [
      { status: "fulfilled", value: [{ ret: "=name=z" }] },
    ]);
  });
});
