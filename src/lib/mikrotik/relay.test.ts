import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getRelayPublicHost, normalizeRelayPublicHost } from "./relay";

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
