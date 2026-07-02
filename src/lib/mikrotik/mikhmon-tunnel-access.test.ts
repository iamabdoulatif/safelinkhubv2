import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureMikhmonTunnelAccess } from "./mikhmon-tunnel-access";

describe("MikHmon tunnel access repair", () => {
  it("skips tunnel firewall rules for tunnel interfaces that do not exist on the router", async () => {
    const calls: string[][] = [];
    const client = {
      async talk(words: string[]) {
        calls.push(words);
        if (words[0] === "/ip/address/print") return [];
        if (words[0] === "/interface/bridge/port/print") return [];
        if (words[0] === "/interface/bridge/print") return [];
        if (words[0] === "/ip/firewall/nat/print") return [{ ".id": "*nat" }];
        if (words[0] === "/interface/print") {
          return words.includes("?name=safelinkhub-wg0") ? [{ ".id": "*wg" }] : [];
        }
        if (words[0] === "/ip/firewall/filter/print" && words.some((word) => word.startsWith("?comment="))) {
          return [];
        }
        if (words[0] === "/ip/firewall/filter/print") return [{ ".id": "*first" }];
        if (words[0] === "/ip/firewall/filter/add") {
          if (words.includes("=in-interface=safelinkhub-ovpn")) {
            throw new Error("input does not match any value of interface");
          }
          return [];
        }
        return [];
      },
    };

    await ensureMikhmonTunnelAccess(client as never);

    const addedFirewallRules = calls.filter((words) => words[0] === "/ip/firewall/filter/add");
    assert.equal(addedFirewallRules.length, 1);
    assert.ok(addedFirewallRules[0].includes("=in-interface=safelinkhub-wg0"));
    assert.ok(!addedFirewallRules[0].includes("=in-interface=safelinkhub-ovpn"));
  });
});
