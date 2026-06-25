import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ROUTER_SETUP_PROFILE,
  getRouterSetupChecklist,
} from "./router-setup-profile";

describe("ROUTER_SETUP_PROFILE", () => {
  it("matches the audited SafeLinkHub hotspot topology", () => {
    assert.equal(ROUTER_SETUP_PROFILE.wanInterface, "E1-WAN-FAI");
    assert.equal(ROUTER_SETUP_PROFILE.hotspotBridge.name, "HOTSPOT");
    assert.equal(ROUTER_SETUP_PROFILE.hotspotBridge.gateway, "10.0.0.1/8");
    assert.equal(ROUTER_SETUP_PROFILE.containerBridge.name, "DOCKERS");
    assert.equal(ROUTER_SETUP_PROFILE.containerBridge.gateway, "11.11.11.1/28");
    assert.equal(ROUTER_SETUP_PROFILE.containerBridge.vethName, "MIKHMON");
    assert.equal(ROUTER_SETUP_PROFILE.containerBridge.vethAddress, "11.11.11.11/28");
    assert.deepEqual(ROUTER_SETUP_PROFILE.hotspotBridge.ports, [
      "ether2",
      "ether3",
      "ether4",
      "ether5",
      "wifi1",
      "wifi2",
    ]);
  });

  it("exposes a compact checklist for the setup wizard", () => {
    const checklist = getRouterSetupChecklist();

    assert.ok(checklist.some((item) => item.includes("hAP ax^2")));
    assert.ok(checklist.some((item) => item.includes("RouterOS 7.23.1")));
    assert.ok(checklist.some((item) => item.includes("DOCKERS")));
    assert.ok(checklist.some((item) => item.includes("8088")));
    assert.ok(checklist.some((item) => item.includes("API 8728")));
  });
});
