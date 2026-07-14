import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getMissingInterfaceListMembers,
  getMissingInterfaceListNames,
} from "./interface-list-reconciliation";

describe("RouterOS interface-list reconciliation", () => {
  it("does not recreate existing WAN/LAN lists or their existing members", () => {
    const listNames = getMissingInterfaceListNames(
      [{ name: "WAN" }, { name: "LAN" }],
      ["WAN", "LAN"],
    );
    const members = getMissingInterfaceListMembers(
      [
        { list: "WAN", interface: "E1-WAN-FAI" },
        { list: "LAN", interface: "SAFELINKHUB-BRIDGE" },
      ],
      [
        { list: "WAN", interface: "E1-WAN-FAI" },
        { list: "LAN", interface: "SAFELINKHUB-BRIDGE" },
      ],
    );

    assert.deepEqual(listNames, []);
    assert.deepEqual(members, []);
  });

  it("adds only the missing list and exact list membership", () => {
    assert.deepEqual(
      getMissingInterfaceListNames([{ name: "WAN" }], ["WAN", "LAN"]),
      ["LAN"],
    );
    assert.deepEqual(
      getMissingInterfaceListMembers(
        [{ list: "WAN", interface: "E1-WAN-FAI" }],
        [
          { list: "WAN", interface: "E1-WAN-FAI" },
          { list: "LAN", interface: "SAFELINKHUB-BRIDGE" },
        ],
      ),
      [{ list: "LAN", interface: "SAFELINKHUB-BRIDGE" }],
    );
  });
});
