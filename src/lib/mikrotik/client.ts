import { Socket } from "net";
import type { Duplex } from "stream";

/**
 * Minimal RouterOS API client (binary word protocol over TCP, RFC: MikroTik API).
 * Implements the modern plain-text login (RouterOS >= 6.43) and basic command
 * execution used to read live device stats.
 *
 * Transport is pluggable: a direct net.Socket for routers reachable on a public
 * IP, or an SSH-forwarded Duplex stream (see relay.ts) for routers only
 * reachable over the WireGuard tunnel from the EC2 relay (Vercel functions have
 * no route into that private subnet).
 */

type Sentence = Record<string, string> & { __tag?: string };

function encodeLength(length: number): Buffer {
  if (length < 0x80) {
    return Buffer.from([length]);
  } else if (length < 0x4000) {
    const buf = Buffer.alloc(2);
    buf.writeUInt16BE(length | 0x8000, 0);
    return buf;
  } else if (length < 0x200000) {
    const buf = Buffer.alloc(3);
    buf[0] = (length >> 16) | 0xc0;
    buf[1] = (length >> 8) & 0xff;
    buf[2] = length & 0xff;
    return buf;
  } else {
    const buf = Buffer.alloc(4);
    buf[0] = (length >> 24) | 0xe0;
    buf.writeUIntBE(length & 0xffffff, 1, 3);
    return buf;
  }
}

function encodeWord(word: string): Buffer {
  const wordBuf = Buffer.from(word, "utf8");
  return Buffer.concat([encodeLength(wordBuf.length), wordBuf]);
}

function encodeSentence(words: string[]): Buffer {
  const parts = words.map(encodeWord);
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

type SentenceWaiter = {
  resolve: (words: string[]) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

class RosConnection {
  private socket: Duplex;
  private buffer = Buffer.alloc(0);
  private connected = false;
  private waiters: SentenceWaiter[] = [];
  /** Erreur transport (socket error/close) : rejette tout ce qui attend encore. */
  private failure: Error | null = null;

  /** Connect directly over TCP to a publicly reachable router. */
  static connectDirect(host: string, port: number, timeoutMs: number): Promise<RosConnection> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("Connection timed out"));
      }, timeoutMs);

      socket.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      socket.connect(port, host, () => {
        clearTimeout(timer);
        resolve(new RosConnection(socket));
      });
    });
  }

  /** Wrap an already-established stream (e.g. an SSH-forwarded tunnel). */
  static fromStream(stream: Duplex): RosConnection {
    return new RosConnection(stream);
  }

  /**
   * UN SEUL listener "data" pour toute la vie de la connexion.
   *
   * readSentence() attachait/détachait le sien à chaque phrase. Retirer un
   * listener "data" ne remet PAS un flux Node en pause (il reste en mode
   * flowing) : les chunks arrivés entre deux phrases étaient donc émis sans
   * personne pour les recevoir, et purement perdus. Invisible sur les petites
   * réponses (tout tient dans un chunk déjà bufferisé), dévastateur sur les
   * grosses : la lecture des 4 869 tickets d'un hotspot rendait 2 900–3 400
   * lignes, un nombre DIFFÉRENT à chaque appel, avec des trous en plein milieu
   * et quelques lignes corrompues — sans lever la moindre erreur.
   *
   * Ici le listener ne bouge plus : tout ce qui arrive est bufferisé, et
   * readSentence() ne fait que consommer ce buffer.
   */
  private constructor(socket: Duplex) {
    this.socket = socket;
    this.connected = true;

    socket.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.pump();
    });
    socket.on("error", (err: Error) => this.fail(err));
    socket.on("close", () =>
      this.fail(new Error("RouterOS connection closed by peer")),
    );
  }

  /** Rejette les lecteurs en attente : plus aucune phrase n'arrivera. */
  private fail(err: Error) {
    this.failure = err;
    this.connected = false;
    const pending = this.waiters;
    this.waiters = [];
    for (const w of pending) {
      clearTimeout(w.timer);
      w.reject(err);
    }
  }

  /** Sert autant de phrases complètes que le buffer en contient. */
  private pump() {
    while (this.waiters.length > 0) {
      let words: string[] | null;
      try {
        words = this.parseSentence();
      } catch (err) {
        this.fail(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      if (words === null) return; // phrase incomplète : on attend la suite
      const waiter = this.waiters.shift()!;
      clearTimeout(waiter.timer);
      waiter.resolve(words);
    }
  }

  /**
   * Extrait une phrase du buffer, ou null si elle est encore incomplète — dans
   * ce cas le buffer est restauré intact pour le prochain chunk.
   */
  private parseSentence(): string[] | null {
    const snapshot = this.buffer;
    const words: string[] = [];
    for (;;) {
      const len = this.readLength();
      if (len === null) {
        this.buffer = snapshot;
        return null;
      }
      if (len === 0) return words;
      if (this.buffer.length < len) {
        this.buffer = snapshot;
        return null;
      }
      words.push(this.buffer.subarray(0, len).toString("utf8"));
      this.buffer = this.buffer.subarray(len);
    }
  }

  write(words: string[]) {
    this.socket.write(encodeSentence(words));
  }

  private readLength(): number | null {
    if (this.buffer.length === 0) return null;
    const c = this.buffer[0];
    if (c < 0x80) {
      this.buffer = this.buffer.subarray(1);
      return c;
    } else if ((c & 0xc0) === 0x80) {
      if (this.buffer.length < 2) return null;
      const len = ((c & 0x3f) << 8) | this.buffer[1];
      this.buffer = this.buffer.subarray(2);
      return len;
    } else if ((c & 0xe0) === 0xc0) {
      if (this.buffer.length < 3) return null;
      const len = ((c & 0x1f) << 16) | (this.buffer[1] << 8) | this.buffer[2];
      this.buffer = this.buffer.subarray(3);
      return len;
    } else if ((c & 0xf0) === 0xe0) {
      if (this.buffer.length < 4) return null;
      const len =
        ((c & 0x0f) << 24) |
        (this.buffer[1] << 16) |
        (this.buffer[2] << 8) |
        this.buffer[3];
      this.buffer = this.buffer.subarray(4);
      return len;
    }
    throw new Error("Invalid RouterOS API length prefix");
  }

  /** Reads one full sentence (array of words ending with a zero-length word). */
  readSentence(timeoutMs: number): Promise<string[]> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Retire CE lecteur de la file : sans ça, la phrase qui arriverait plus
        // tard serait servie à un appelant qui a déjà abandonné, décalant
        // toutes les réponses suivantes d'un cran.
        this.waiters = this.waiters.filter((w) => w.timer !== timer);
        reject(new Error("Read timed out"));
      }, timeoutMs);

      this.waiters.push({ resolve, reject, timer });
      // Le buffer contient peut-être déjà la phrase (plusieurs phrases arrivent
      // souvent dans un même chunk) : inutile d'attendre un nouvel événement.
      this.pump();
    });
  }

  close() {
    if (this.connected) this.socket.end();
  }
}

/** Reconnaissable par les appelants qui décident de réessayer ou non — une
 *  connexion hors-sync ne guérit pas, chaque commande suivante échouera. */
export const ROUTEROS_DESYNC_MESSAGE =
  "RouterOS connection is out of sync after a timed-out command — reconnect required.";

export class RouterOSClient {
  private conn: RosConnection | null = null;
  // A read timeout abandons a command that RouterOS is still answering: its
  // remaining sentences stay in flight and the next talk() reads them as its
  // own reply, shifting every result one command back. There is no way to tell
  // a late sentence from a fresh one on an untagged stream, so the connection
  // is poisoned for good once that happens — refuse it instead of returning
  // answers that belong to another command.
  private desynced = false;

  async connect(
    host: string,
    port: number,
    username: string,
    password: string,
    timeoutMs = 8000,
  ) {
    const conn = await RosConnection.connectDirect(host, port, timeoutMs);
    await this.login(conn, username, password, timeoutMs);
  }

  /** Authenticate over an already-open stream (e.g. SSH-forwarded tunnel). */
  async connectViaStream(
    stream: Duplex,
    username: string,
    password: string,
    timeoutMs = 8000,
  ) {
    const conn = RosConnection.fromStream(stream);
    await this.login(conn, username, password, timeoutMs);
  }

  private async login(
    conn: RosConnection,
    username: string,
    password: string,
    timeoutMs: number,
  ) {
    this.conn = conn;

    conn.write(["/login", `=name=${username}`, `=password=${password}`]);
    const reply = await conn.readSentence(timeoutMs);

    if (reply[0] === "!trap") {
      conn.close();
      this.conn = null;
      const message = reply.find((w) => w.startsWith("=message="));
      throw new Error(
        message ? message.replace("=message=", "") : "RouterOS login failed",
      );
    }
    if (reply[0] !== "!done") {
      conn.close();
      this.conn = null;
      throw new Error("Unexpected RouterOS login response");
    }
  }

  async talk(words: string[], timeoutMs = 8000): Promise<Sentence[]> {
    if (!this.conn) throw new Error("Not connected");
    if (this.desynced) throw new Error(ROUTEROS_DESYNC_MESSAGE);
    this.conn.write(words);

    const results: Sentence[] = [];
    // A failed command replies "!trap ... !done" — the terminating !done
    // still belongs to THIS command. Throwing as soon as the !trap arrives
    // left that !done unread, so the next talk() consumed it as its own
    // (empty) response and every reply after that was shifted one command
    // back: /system/device-mode/print could literally return a WiFi
    // interface row. Read until !done first, then throw.
    let trapMessage: string | null = null;
    while (true) {
      let reply: string[];
      try {
        reply = await this.conn.readSentence(timeoutMs);
      } catch (err) {
        this.desynced = true;
        throw err;
      }
      const type = reply[0];
      if (type === "!done") break;
      if (type === "!fatal") {
        // Fatal errors close the connection — no !done follows.
        throw new Error(reply.slice(1).join(" ") || "RouterOS connection terminated");
      }
      if (type === "!trap") {
        const message = reply.find((w) => w.startsWith("=message="));
        trapMessage = message ? message.replace("=message=", "") : "RouterOS command failed";
        continue;
      }
      if (type === "!re") {
        const sentence: Sentence = {};
        for (const word of reply.slice(1)) {
          const eq = word.indexOf("=", 1);
          if (word.startsWith("=") && eq > 0) {
            sentence[word.slice(1, eq)] = word.slice(eq + 1);
          }
        }
        results.push(sentence);
      }
    }
    if (trapMessage !== null) throw new Error(trapMessage);
    return results;
  }

  close() {
    this.conn?.close();
    this.conn = null;
  }
}
