import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { afterEach, describe, it } from "node:test";
import {
  buildAllocatePortForwardScript,
  buildPortForwardRebindScript,
  getRelayPublicHost,
  normalizeRelayPublicHost,
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

describe("allocation d'un port de forward", () => {
  const script = buildAllocatePortForwardScript();

  it("évite la plage éphémère du noyau, lue à chaud sur le relais", () => {
    // Un port de forward dans net.ipv4.ip_local_port_range peut être volé comme
    // port source par une socket sortante → bind() nginx « Address already in
    // use ». La plage est lue vivante, pas codée en dur.
    assert.match(script, /\/proc\/sys\/net\/ipv4\/ip_local_port_range/);
    assert.match(script, /in_ephemeral\(\)\s*{\s*\[ "\$1" -ge "\$EPH_LO" \] && \[ "\$1" -le "\$EPH_HI" \]/);
    // Les deux boucles (aléatoire + repli séquentiel) sautent la plage.
    assert.equal(script.match(/if in_ephemeral "\$cand"; then continue; fi/g)?.length, 2);
  });

  it("garde-fou exécutable : échoue si le port choisi tombe quand même dans la plage", () => {
    assert.match(script, /if in_ephemeral "\$PORT"; then[\s\S]*exit 1/);
  });

  it("prouve l'arithmétique in_ephemeral en bash", () => {
    const inEphemeral = (lo: number, hi: number, v: number) => {
      try {
        execFileSync("bash", [
          "-c",
          `EPH_LO=${lo}; EPH_HI=${hi}; cand=${v}; in_ephemeral() { [ "$1" -ge "$EPH_LO" ] && [ "$1" -le "$EPH_HI" ]; }; in_ephemeral "$cand"`,
        ]);
        return true;
      } catch {
        return false;
      }
    };
    // Plage Linux par défaut 32768-60999 : le port en panne (36830) est dedans,
    // un port hors plage ne l'est pas.
    assert.equal(inEphemeral(32768, 60999, 36830), true);
    assert.equal(inEphemeral(32768, 60999, 32768), true);
    assert.equal(inEphemeral(32768, 60999, 60999), true);
    assert.equal(inEphemeral(32768, 60999, 32767), false);
    assert.equal(inEphemeral(32768, 60999, 61000), false);
    assert.equal(inEphemeral(32768, 60999, 1500), false);
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
