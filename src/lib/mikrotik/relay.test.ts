import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { afterEach, describe, it } from "node:test";
import {
  __setRelayClientFactoryForTests,
  buildPortForwardRebindScript,
  getRelayPublicHost,
  normalizeRelayPublicHost,
  openRouterTunnel,
  relayWebUrl,
} from "./relay";

const originalPublicHost = process.env.WG_RELAY_PUBLIC_HOST;
const originalRelayHost = process.env.WG_RELAY_HOST;
const originalBaseDomain = process.env.RELAY_BASE_DOMAIN;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("WG_RELAY_PUBLIC_HOST", originalPublicHost);
  restore("WG_RELAY_HOST", originalRelayHost);
  restore("RELAY_BASE_DOMAIN", originalBaseDomain);
});

describe("relay public host", () => {
  it("normalizes URLs to a hostname usable by WireGuard endpoints", () => {
    assert.equal(normalizeRelayPublicHost("https://vpn.example.com/path"), "vpn.example.com");
    assert.equal(normalizeRelayPublicHost("http://vpn.example.com:8080"), "vpn.example.com");
    assert.equal(normalizeRelayPublicHost(" vpn.example.com "), "vpn.example.com");
  });

  it("prefers WG_RELAY_PUBLIC_HOST over the SSH relay host", () => {
    process.env.WG_RELAY_PUBLIC_HOST = "https://vpn.example.com";
    process.env.WG_RELAY_HOST = "3.221.39.207";

    assert.equal(getRelayPublicHost(), "vpn.example.com");
  });

  it("falls back to WG_RELAY_HOST when no public hostname is configured", () => {
    delete process.env.WG_RELAY_PUBLIC_HOST;
    process.env.WG_RELAY_HOST = "3.221.39.207";

    assert.equal(getRelayPublicHost(), "3.221.39.207");
  });

  it("ignores the shard while sharding is disabled (RELAY_BASE_DOMAIN unset)", () => {
    delete process.env.RELAY_BASE_DOMAIN;
    process.env.WG_RELAY_PUBLIC_HOST = "sn.safelinkhub.io";

    assert.equal(getRelayPublicHost("s2"), "sn.safelinkhub.io");
  });

  it("returns <shard>.<RELAY_BASE_DOMAIN> when sharding is enabled", () => {
    process.env.RELAY_BASE_DOMAIN = "safelinkhub.io";
    process.env.WG_RELAY_PUBLIC_HOST = "sn.safelinkhub.io";

    assert.equal(getRelayPublicHost("s2"), "s2.safelinkhub.io");
    // No/invalid shard → still the legacy single host, even when enabled.
    assert.equal(getRelayPublicHost(), "sn.safelinkhub.io");
    assert.equal(getRelayPublicHost("bogus"), "sn.safelinkhub.io");
  });
});

describe("rebind des forwards", () => {
  it("conserve le port public et remplace seulement l'IP tunnel", () => {
    const script = buildPortForwardRebindScript("10.66.0.10", "10.66.0.11", [
      { targetPort: 8291, publicPort: 39001, tlsTerminated: false },
      { targetPort: 80, publicPort: 39002, tlsTerminated: true },
    ]);
    assert.match(script, /10\.66\.0\.10/);
    assert.match(script, /10\.66\.0\.11/);
    assert.match(script, /39001/);
    assert.match(script, /39002/);
    assert.doesNotMatch(script, /allocatePortForward/);
  });
});

describe("lien web d'une redirection du relais", () => {
  it("est en https — nginx ne parle que TLS sur ces ports", () => {
    /* Mesuré sur un routeur dont MikHmon tournait (s3:16984) : `http://`
       reçoit un 400 de nginx, `https://` un 302 vers la page de connexion.
       Les 55 vhosts du relais portent tous `listen <port> ssl`. */
    process.env.RELAY_BASE_DOMAIN = "safelinkhub.io";
    process.env.RELAY_SHARDING = "1";
    assert.equal(relayWebUrl("s2", 25226), "https://s2.safelinkhub.io:25226");
    assert.ok(!relayWebUrl("s3", 16984).startsWith("http://"), "jamais de http:// nu");
  });
});

// Faux ssh2 Client : compte les connexions créées et sert des canaux forwardOut
// sans réseau. `end()` est idempotent (comme le vrai Client : pas de double
// 'close').
class FakeRelayClient extends EventEmitter {
  static created = 0;
  static last: FakeRelayClient | null = null;
  private ended = false;
  constructor() {
    super();
    FakeRelayClient.created++;
    FakeRelayClient.last = this;
  }
  connect() {
    setImmediate(() => this.emit("ready"));
    return this;
  }
  forwardOut(
    _src: string,
    _srcPort: number,
    _dst: string,
    _dstPort: number,
    cb: (err: Error | undefined, stream: unknown) => void,
  ) {
    const stream = Object.assign(new EventEmitter(), { end() {}, destroy() {} });
    setImmediate(() => cb(undefined, stream));
    return this;
  }
  end() {
    if (!this.ended) {
      this.ended = true;
      setImmediate(() => this.emit("close"));
    }
    return this;
  }
}

describe("connexion relais mutualisée", () => {
  const KEYS = ["WG_RELAY_HOST", "WG_RELAY_SSH_USER", "WG_RELAY_SSH_KEY_B64"] as const;
  const savedEnv = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

  function withRelayEnv() {
    process.env.WG_RELAY_HOST = "relay.test";
    process.env.WG_RELAY_SSH_USER = "relay";
    process.env.WG_RELAY_SSH_KEY_B64 = Buffer.from("fake-key").toString("base64");
    FakeRelayClient.created = 0;
    FakeRelayClient.last = null;
    __setRelayClientFactoryForTests(
      () => new FakeRelayClient() as unknown as import("ssh2").Client,
    );
  }

  afterEach(() => {
    __setRelayClientFactoryForTests(null);
    for (const k of KEYS) restore(k, savedEnv[k]);
  });

  it("réutilise UNE connexion pour plusieurs routeurs, et fermer un canal ne la ferme pas", async () => {
    withRelayEnv();
    const a = await openRouterTunnel("10.66.0.10", 8728);
    const b = await openRouterTunnel("10.66.0.11", 8728);
    assert.equal(FakeRelayClient.created, 1, "une seule connexion SSH partagée, pas un handshake par routeur");
    a.close();
    b.close();
    await openRouterTunnel("10.66.0.12", 8728);
    assert.equal(FakeRelayClient.created, 1, "fermer un canal ne ferme pas la connexion partagée");
  });

  it("se reconnecte quand la connexion partagée tombe", async () => {
    withRelayEnv();
    await openRouterTunnel("10.66.0.10", 8728);
    assert.equal(FakeRelayClient.created, 1);
    // Chute silencieuse (sshd redémarré / relais rebooté) → le pool se vide.
    FakeRelayClient.last?.emit("close");
    await new Promise((r) => setImmediate(r));
    await openRouterTunnel("10.66.0.11", 8728);
    assert.equal(FakeRelayClient.created, 2, "une nouvelle connexion est rouverte après une chute");
  });
});
