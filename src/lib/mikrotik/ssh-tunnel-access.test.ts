import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureSshTunnelAccess, withSshSftpPolicy } from "./ssh-tunnel-access";

describe("SSH/SFTP tunnel access repair", () => {
  it("converts a SafeLinkHub API-only policy into one that can authenticate SFTP", () => {
    assert.equal(
      withSshSftpPolicy("read,write,test,sensitive,api,!local,!telnet,!ssh,!ftp,!reboot"),
      "read,write,test,sensitive,api,ssh,ftp,!local,!telnet,!reboot",
    );
  });

  it("enables SSH and only adds firewall rules for tunnel interfaces present on the router", async () => {
    const calls: string[][] = [];
    const client = {
      async talk(words: string[]) {
        calls.push(words);
        if (words[0] === "/ip/service/set") return [];
        if (words[0] === "/user/print") return [{ ".id": "*user", group: "safelinkhub-group" }];
        if (words[0] === "/user/group/print") {
          return [{
            ".id": "*group",
            name: "safelinkhub-group",
            policy: "read,write,test,sensitive,api,!local,!telnet,!ssh,!ftp,!reboot",
          }];
        }
        if (words[0] === "/user/group/set") return [];
        if (words[0] === "/ip/firewall/filter/print" && words.some((word) => word.startsWith("?comment="))) {
          return [];
        }
        if (words[0] === "/ip/firewall/filter/print") return [{ ".id": "*first" }];
        if (words[0] === "/interface/print") {
          return words.includes("?name=safelinkhub-wg0") ? [{ ".id": "*wg" }] : [];
        }
        if (words[0] === "/ip/firewall/filter/add") {
          if (words.includes("=in-interface=safelinkhub-ovpn")) {
            throw new Error("input does not match any value of interface");
          }
          return [];
        }
        return [];
      },
    };

    await ensureSshTunnelAccess(client as never, [], "safelinkhub-api");

    assert.ok(calls.some((words) => words.join(" ") === "/ip/service/set =numbers=ssh =disabled=no"));
    const addedFirewallRules = calls.filter((words) => words[0] === "/ip/firewall/filter/add");
    assert.equal(addedFirewallRules.length, 1);
    assert.ok(addedFirewallRules[0].includes("=chain=input"));
    assert.ok(addedFirewallRules[0].includes("=in-interface=safelinkhub-wg0"));
    assert.ok(addedFirewallRules[0].includes("=dst-port=22"));
    assert.ok(calls.some((words) => words.join(" ") === "/user/group/set =numbers=*group =policy=read,write,test,sensitive,api,ssh,ftp,!local,!telnet,!reboot"));
  });

  it("still repairs the tunnel firewall when the existing API user cannot change group policy", async () => {
    const calls: string[][] = [];
    const client = {
      async talk(words: string[]) {
        calls.push(words);
        if (words[0] === "/ip/service/set") return [];
        if (words[0] === "/user/print") return [{ ".id": "*user", group: "safelinkhub-group" }];
        if (words[0] === "/user/group/print") {
          return [{ ".id": "*group", policy: "read,write,test,sensitive,api,!ssh,!ftp" }];
        }
        if (words[0] === "/user/group/set") throw new Error("not enough permissions (9)");
        if (words[0] === "/ip/firewall/filter/print" && words.some((word) => word.startsWith("?comment="))) return [];
        if (words[0] === "/ip/firewall/filter/print") return [{ ".id": "*first" }];
        if (words[0] === "/interface/print") {
          return words.includes("?name=safelinkhub-wg0") ? [{ ".id": "*wg" }] : [];
        }
        if (words[0] === "/ip/firewall/filter/add") return [];
        return [];
      },
    };

    await ensureSshTunnelAccess(client as never, [], "safelinkhub-api");

    assert.ok(calls.some((words) => words[0] === "/ip/firewall/filter/add"));
  });
});
