import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RouterOSClient } from "./client";
import { removeDualWanConfig } from "./dualwan-remove";

describe("removeDualWanConfig", () => {
  it("retire par clé (commentaire, marque, table, liste), remet WAN1 d'aplomb, rebranche WAN2", async () => {
    const calls: string[][] = [];
    const data: Record<string, Record<string, string>[]> = {
      "/ip/firewall/mangle/print": [{ ".id": "*1", comment: "PCC 1/2 -> WAN1" }, { ".id": "*2", action: "mark-routing", "new-routing-mark": "to-WAN2" }, { ".id": "*3", action: "change-ttl" }],
      "/ip/route/print": [{ ".id": "*a", comment: "Sonde WAN1" }, { ".id": "*b", comment: "Main WAN2" }, { ".id": "*c", comment: "Autre" }],
      "/routing/table/print": [{ ".id": "*t", name: "to-WAN1" }, { ".id": "*m", name: "main" }],
      "/ip/firewall/nat/print": [{ ".id": "*n", comment: "NAT WAN2" }, { ".id": "*h", action: "masquerade", "out-interface": "E1-WAN-FAI" }],
      "/ip/firewall/address-list/print": [{ ".id": "*l", list: "slh-pcc-exclude" }],
      "/interface/list/member/print": [{ ".id": "*w", list: "WAN", interface: "E2-WAN-FAI" }, { ".id": "*w1", list: "WAN", interface: "E1-WAN-FAI" }],
      "/ip/dhcp-client/print": [{ ".id": "*d1", interface: "E1-WAN-FAI", script: ':if ($bound=1) do={ /ip route set [find comment="Sonde WAN1"] gateway=$"gateway-address" }' }, { ".id": "*d2", interface: "E2-WAN-FAI" }],
      "/interface/ethernet/print": [{ ".id": "*e2", name: "E2-WAN-FAI", "default-name": "ether2" }],
      "/interface/bridge/port/print": [],
    };
    const client = { async talk(words: string[]) { calls.push(words); return data[words[0]] ?? []; } } as unknown as RouterOSClient;
    const report = await removeDualWanConfig(client, { wan2Interface: "E2-WAN-FAI", returnWan2ToBridge: "HOTSPOT" });
    assert.deepEqual(report, { mangle: 2, routes: 2, tables: 1, nat: 1, address_list: 1, wan_list: 1, dhcp_wan2: 1, dhcp_wan1_restored: 1, wan2_bridged: 1 });
    const removes = calls.filter((c) => c[0].endsWith("/remove")).map((c) => `${c[0]} ${c[1]}`);
    assert.deepEqual(removes, ["/ip/firewall/mangle/remove =numbers=*1,*2", "/ip/route/remove =numbers=*a,*b", "/routing/table/remove =numbers=*t", "/ip/firewall/nat/remove =numbers=*n", "/ip/firewall/address-list/remove =numbers=*l", "/interface/list/member/remove =numbers=*w", "/ip/dhcp-client/remove =numbers=*d2"]);
    assert.ok(calls.some((c) => c[0] === "/ip/dhcp-client/set" && c.includes("=numbers=*d1") && c.includes("=script=")));
    assert.ok(calls.some((c) => c[0] === "/interface/ethernet/set" && c.includes("=name=ether2")));
    assert.ok(calls.some((c) => c[0] === "/interface/bridge/port/add" && c.includes("=bridge=HOTSPOT") && c.includes("=interface=ether2")));

    // Simulation : même rapport, aucune écriture.
    calls.length = 0;
    const dry = await removeDualWanConfig(client, { wan2Interface: "E2-WAN-FAI", returnWan2ToBridge: "HOTSPOT", dryRun: true });
    assert.deepEqual(dry, report);
    assert.ok(calls.every((c) => c[0].endsWith("/print")), calls.map((c) => c[0]).join(","));
  });
});
