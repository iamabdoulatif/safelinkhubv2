import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRouterAccessSummary } from "./router-access-summary";

describe("buildRouterAccessSummary", () => {
  it("extracts the operator-facing remote access identity", () => {
    const summary = buildRouterAccessSummary({
      routerName: "GUEASSO-HSPT",
      tunnelIp: "10.66.0.5",
      identityRows: [{ name: "GUEASSO-HSPT" }],
      addressRows: [
        { address: "10.0.0.1/8", interface: "HOTSPOT", dynamic: "false" },
        { address: "10.66.0.5/32", interface: "safelinkhub-wg0", dynamic: "false" },
        { address: "192.168.1.65/24", interface: "E1-WAN-FAI", dynamic: "true" },
      ],
      interfaceRows: [
        { name: "E1-WAN-FAI", type: "ether", "mac-address": "D0:EA:11:81:02:EB" },
        { name: "safelinkhub-wg0", type: "wireguard", "mac-address": "" },
      ],
      routeRows: [{ "dst-address": "0.0.0.0/0", gateway: "192.168.1.254" }],
    });

    assert.deepEqual(summary, {
      identity: "GUEASSO-HSPT",
      wanInterface: "E1-WAN-FAI",
      wanMacAddress: "D0:EA:11:81:02:EB",
      wanIpAddress: "192.168.1.65",
      tunnelIp: "10.66.0.5",
      defaultGateway: "192.168.1.254",
    });
  });

  it("falls back to router data when live rows are incomplete", () => {
    const summary = buildRouterAccessSummary({
      routerName: "Fallback Router",
      tunnelIp: null,
      identityRows: [],
      addressRows: [],
      interfaceRows: [],
      routeRows: [],
    });

    assert.equal(summary.identity, "Fallback Router");
    assert.equal(summary.wanInterface, "");
    assert.equal(summary.wanMacAddress, "");
    assert.equal(summary.wanIpAddress, "");
    assert.equal(summary.tunnelIp, "");
    assert.equal(summary.defaultGateway, "");
  });
});
