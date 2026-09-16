import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RouterOSClient } from "./client";
import { detectUplinkInterface, detectUplinkInterfaces } from "./router-lock";

const fake = (dhcp: Record<string, string>[], routes: Record<string, string>[] = []) =>
  ({ async talk(words: string[]) { return words[0] === "/ip/dhcp-client/print" ? dhcp : routes; } }) as unknown as RouterOSClient;

describe("detectUplinkInterfaces (dual WAN)", () => {
  it("liste tous les clients DHCP actifs, le lien « bound » d'abord, le lien débranché ensuite", async () => {
    const client = fake([
      { interface: "E2-WAN-FAI", status: "stopped" },
      { interface: "E1-WAN-FAI", status: "bound" },
      { interface: "ether5", status: "bound", disabled: "true" },
    ]);
    assert.deepEqual(await detectUplinkInterfaces(client, 100), ["E1-WAN-FAI", "E2-WAN-FAI"]);
    assert.equal(await detectUplinkInterface(client, 100), "E1-WAN-FAI");
  });

  it("sans bail actif, retombe sur l'interface de la route par défaut", async () => {
    const client = fake([{ interface: "E2-WAN-FAI", status: "stopped" }], [{ "immediate-gw": "192.168.1.1%E1-WAN-FAI" }]);
    assert.deepEqual(await detectUplinkInterfaces(client, 100), ["E1-WAN-FAI"]);
    assert.deepEqual(await detectUplinkInterfaces(fake([]), 100), []);
  });
});
