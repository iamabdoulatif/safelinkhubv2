import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getMikhmonTunnelNatCommands,
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
});
