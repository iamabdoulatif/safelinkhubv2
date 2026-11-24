import assert from "node:assert/strict";
import test from "node:test";
import { hostedAgentEligible, hostedAgentTransportLabel } from "./hosted-agent";

test("l'agent hébergé ne cible que les routeurs tunnel en ligne", () => {
  assert.equal(hostedAgentEligible({ connectionMethod: "vpn", status: "online" }), true);
  assert.equal(hostedAgentEligible({ connectionMethod: "openvpn", status: "online" }), true);
  assert.equal(hostedAgentEligible({ connectionMethod: "sstp", status: "online" }), true);
  assert.equal(hostedAgentEligible({ connectionMethod: "direct", status: "online" }), false);
  assert.equal(hostedAgentEligible({ connectionMethod: "vpn", status: "offline" }), false);
});

test("les transports hébergés ont un libellé opérateur explicite", () => {
  assert.equal(hostedAgentTransportLabel("vpn"), "WireGuard");
  assert.equal(hostedAgentTransportLabel("openvpn"), "OpenVPN");
  assert.equal(hostedAgentTransportLabel("sstp"), "SSTP");
});
