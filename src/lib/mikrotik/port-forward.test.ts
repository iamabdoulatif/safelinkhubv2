import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getDockerBridgeCleanupCommands,
  getMikhmonTunnelFirewallCommands,
  getMikhmonTunnelNatCommands,
  getSshTunnelFirewallCommands,
  getPortForwardTargetPort,
} from "./port-forward-rules";

describe("port-forward helpers", () => {
  it("targets MikHmon relay traffic at the RouterOS tunnel NAT port", () => {
    assert.equal(getPortForwardTargetPort("mikhmon"), 8089);
    assert.equal(getPortForwardTargetPort("winbox"), 8291);
    assert.equal(getPortForwardTargetPort("unknown"), null);
  });

  it("builds the RouterOS commands needed for MikHmon tunnel NAT", () => {
    const commands = getMikhmonTunnelNatCommands();

    assert.deepEqual(commands.findExisting, [
      "/ip/firewall/nat/print",
      "?chain=dstnat",
      "?action=dst-nat",
      "?comment=MikHmon via tunnel",
    ]);
    assert.deepEqual(commands.add, [
      "/ip/firewall/nat/add",
      "=chain=dstnat",
      "=dst-port=8089",
      "=protocol=tcp",
      "=action=dst-nat",
      "=to-addresses=11.11.11.11",
      "=to-ports=80",
      "=comment=MikHmon via tunnel",
    ]);
  });

  it("builds firewall commands that allow MikHmon from managed tunnel interfaces", () => {
    const wireguard = getMikhmonTunnelFirewallCommands("safelinkhub-wg0", "*2");
    const openvpn = getMikhmonTunnelFirewallCommands("safelinkhub-ovpn");

    assert.deepEqual(wireguard.findExisting, [
      "/ip/firewall/filter/print",
      "?chain=forward",
      "?comment=Allow MikHmon via SafeLinkHub tunnel (safelinkhub-wg0)",
    ]);
    assert.deepEqual(wireguard.add, [
      "/ip/firewall/filter/add",
      "=chain=forward",
      "=action=accept",
      "=protocol=tcp",
      "=in-interface=safelinkhub-wg0",
      "=dst-address=11.11.11.11",
      "=dst-port=80",
      "=comment=Allow MikHmon via SafeLinkHub tunnel (safelinkhub-wg0)",
      "=place-before=*2",
    ]);

    assert.ok(openvpn.add.includes("=in-interface=safelinkhub-ovpn"));
    assert.ok(!openvpn.add.some((word) => word.startsWith("=place-before=")));
  });

  it("builds cleanup commands for duplicate legacy Docker bridge gateways", () => {
    const commands = getDockerBridgeCleanupCommands("DOCKER");

    assert.deepEqual(commands.findGatewayAddress, [
      "/ip/address/print",
      "?interface=DOCKER",
      "?address=11.11.11.1/28",
    ]);
    assert.deepEqual(commands.removeGatewayAddress("*7"), ["/ip/address/remove", "=numbers=*7"]);
    assert.deepEqual(commands.findBridgePorts, [
      "/interface/bridge/port/print",
      "?bridge=DOCKER",
    ]);
    assert.deepEqual(commands.findBridge, ["/interface/bridge/print", "?name=DOCKER"]);
    assert.deepEqual(commands.removeBridge("*8"), ["/interface/bridge/remove", "=numbers=*8"]);
  });

  it("builds input firewall commands that allow SSH and SFTP from managed tunnel interfaces", () => {
    const commands = getSshTunnelFirewallCommands("safelinkhub-wg0", "*10");

    assert.deepEqual(commands.findExisting, [
      "/ip/firewall/filter/print",
      "?chain=input",
      "?comment=Allow SSH/SFTP via SafeLinkHub tunnel (safelinkhub-wg0)",
    ]);
    assert.deepEqual(commands.add, [
      "/ip/firewall/filter/add",
      "=chain=input",
      "=action=accept",
      "=protocol=tcp",
      "=in-interface=safelinkhub-wg0",
      "=dst-port=22",
      "=comment=Allow SSH/SFTP via SafeLinkHub tunnel (safelinkhub-wg0)",
      "=place-before=*10",
    ]);
  });
});
