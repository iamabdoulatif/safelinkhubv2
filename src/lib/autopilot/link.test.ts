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

import { validAccounts } from "./link";
import { buildGuardedVpnInstallCommand } from "../mikrotik/vpn-install";

test("validAccounts : noms et mots de passe sûrs uniquement", () => {
  assert.deepEqual(validAccounts([{ name: "app-audit", password: "s3cret-pass", access: "read" }]), [{ name: "app-audit", password: "s3cret-pass", access: "read" }]);
  assert.equal(validAccounts([{ name: "admin", password: "s3cret-pass", access: "write" }]), null);
  assert.equal(validAccounts([{ name: "safelinkhub-api", password: "s3cret-pass", access: "read" }]), null);
  assert.equal(validAccounts([{ name: "app-audit", password: 'abc"defgh', access: "read" }]), null);
  assert.equal(validAccounts([{ name: "app-audit", password: "short", access: "read" }]), null);
  assert.equal(validAccounts([{ name: "app-audit", password: "s3cret-pass", access: "full" }]), null);
  assert.equal(validAccounts([]), null);
});

test("ligne d'installation sans conflit : n'installe rien si safelinkhub-wg0 existe déjà", () => {
  const c = buildGuardedVpnInstallCommand("https://x/api/router/v1/o/scripts/install-vpn", "https://x/api/router/v1/o/scripts/install-vpn/cancel", "tok");
  assert.match(c, /^:if \(\[:len \[\/interface wireguard find name="safelinkhub-wg0"\]\] > 0\) do=\{/);
  const [deja, sinon] = c.split("} else={");
  assert.ok(deja.includes("install-vpn/cancel") && !deja.includes("vpn.rsc"), "branche « déjà installé » : annulation seulement");
  assert.ok(sinon.includes('/import file-name="vpn.rsc"'), "branche normale : installation");
});

import { standaloneSlug } from "./link";

test("organisation technique Auto-Pilot : slug stable, préfixé, sans la référence en clair", () => {
  const ref = "a".repeat(64);
  assert.equal(standaloneSlug(ref), standaloneSlug(ref));
  assert.match(standaloneSlug(ref), /^autopilot-[0-9a-f]{16}$/);
  assert.notEqual(standaloneSlug(ref), standaloneSlug("b".repeat(64)));
});
