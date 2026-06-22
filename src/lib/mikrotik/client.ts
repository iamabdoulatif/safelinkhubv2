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

class RosConnection {
  private socket: Duplex;
  private buffer = Buffer.alloc(0);
  private connected = false;

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

  private constructor(socket: Duplex) {
    this.socket = socket;
    this.connected = true;
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
    return new Promise((resolve, reject) => {
      const words: string[] = [];
      const savedBuffer = this.buffer;

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Read timed out"));
      }, timeoutMs);

      const tryParse = () => {
        while (true) {
          const startBuffer = this.buffer;
          const len = this.readLength();
          if (len === null) {
            this.buffer = startBuffer;
            return false;
          }
          if (len === 0) {
            cleanup();
            resolve(words);
            return true;
          }
          if (this.buffer.length < len) {
            this.buffer = startBuffer;
            return false;
          }
          const word = this.buffer.subarray(0, len).toString("utf8");
          this.buffer = this.buffer.subarray(len);
          words.push(word);
        }
      };

      const onData = (chunk: Buffer) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        try {
          tryParse();
        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.socket.removeListener("data", onData);
      };

      this.socket.on("data", onData);
      this.buffer = savedBuffer;
      try {
        if (tryParse()) return;
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }

  close() {
    if (this.connected) this.socket.end();
  }
}

export class RouterOSClient {
  private conn: RosConnection | null = null;

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
    this.conn.write(words);

    const results: Sentence[] = [];
    while (true) {
      const reply = await this.conn.readSentence(timeoutMs);
      const type = reply[0];
      if (type === "!done") break;
      if (type === "!trap") {
        const message = reply.find((w) => w.startsWith("=message="));
        throw new Error(
          message ? message.replace("=message=", "") : "RouterOS command failed",
        );
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
    return results;
  }

  close() {
    this.conn?.close();
    this.conn = null;
  }
}
