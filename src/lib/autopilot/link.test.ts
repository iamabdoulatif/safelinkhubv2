import { test } from "node:test";
import assert from "node:assert/strict";
import { newLinkCode, normalizeCode, toAutopilotRouter } from "./link";

const base = { id: "r1", name: "HSPT-ADJA", host: "10.66.0.73", status: "online", model: "hAP ax2", mikhmonImage: "latif225/mikhmon-sf-v1:latest" };

test("toAutopilotRouter : REST par le port webfig, MikHmon par son port de tunnel", () => {
  const r = toAutopilotRouter(base, [{ service: "webfig", targetPort: 85 }, { service: "mikhmon", targetPort: 8089 }], null);
  assert.equal(r.routerosUrl, "http://10.66.0.73:85");
  assert.equal(r.mikhmonUrl, "http://10.66.0.73:8089/admin.php?id=login");
  assert.equal(r.mikhmonVariant, "sf-v1");
  assert.equal(r.online, true);
});

test("toAutopilotRouter : v3, ports par défaut, instance cloud prioritaire", () => {
  const v3 = toAutopilotRouter({ ...base, mikhmonImage: "latif225/mikhmonv3-safelinkhub:latest", status: "offline" }, [], null);
  assert.equal(v3.mikhmonVariant, "v3");
  assert.equal(v3.routerosUrl, "http://10.66.0.73:80");
  assert.equal(v3.online, false);
  const cloud = toAutopilotRouter({ ...base, mikhmonImage: null }, [], { domain: "m1.safelinkhub.io", edition: "v6" });
  assert.equal(cloud.mikhmonUrl, "https://m1.safelinkhub.io/admin.php?id=login");
  assert.equal(cloud.mikhmonVariant, "v3");
  assert.equal(toAutopilotRouter({ ...base, mikhmonImage: null }, [], null).mikhmonUrl, null);
});

test("code de liaison : 8 caractères lisibles, saisie tolérante", () => {
  const c = newLinkCode();
  assert.match(c, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(normalizeCode(" ab3d-ef9h "), "AB3DEF9H");
});
