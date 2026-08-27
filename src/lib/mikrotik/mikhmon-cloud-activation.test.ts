import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveMikhmonCloudTunnel } from "./mikhmon-cloud-activation";

describe("MikHmon cloud activation tunnel", () => {
  it("identifies the WireGuard tunnel used by RouterOS 7", () => {
    assert.deepEqual(resolveMikhmonCloudTunnel("vpn"), {
      id: "wireguard",
      label: "WireGuard",
      routerOsRange: "RouterOS 7.0 à 7.24.1",
      ready: true,
    });
  });

  it("identifies the OpenVPN tunnel used by RouterOS 6", () => {
    assert.deepEqual(resolveMikhmonCloudTunnel("openvpn"), {
      id: "openvpn",
      label: "OpenVPN",
      routerOsRange: "RouterOS 6.x",
      ready: true,
    });
  });

  it("does not offer a cloud activation without a managed tunnel", () => {
    assert.deepEqual(resolveMikhmonCloudTunnel("direct"), {
      id: null,
      label: "Tunnel SafeLinkHub requis",
      routerOsRange: null,
      ready: false,
    });
  });

  it("requires the tunnel address to be assigned before provisioning", () => {
    assert.deepEqual(resolveMikhmonCloudTunnel("vpn", null), {
      id: null,
      label: "Tunnel SafeLinkHub requis",
      routerOsRange: null,
      ready: false,
    });
  });
});
