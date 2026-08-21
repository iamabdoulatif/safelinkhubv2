import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldRepairRouterMikhmon, resolveMikhmonAccess } from "./mikhmon-online-access";

describe("MikHmon Online access", () => {
  it("retourne le domaine HTTPS d'une instance cloud sur un routeur legacy", () => {
    assert.deepEqual(
      resolveMikhmonAccess({
        supportsContainers: false,
        cloudDomain: "rb951-korhogo-14174000.mikhmon.safelinkhub.io",
      }),
      {
        kind: "cloud",
        url: "https://rb951-korhogo-14174000.mikhmon.safelinkhub.io",
      },
    );
  });

  it("ne construit aucun domaine cloud pour un routeur local ou sans instance", () => {
    assert.equal(
      resolveMikhmonAccess({
        supportsContainers: true,
        cloudDomain: "rb951-korhogo-14174000.mikhmon.safelinkhub.io",
      }),
      null,
    );
    assert.equal(resolveMikhmonAccess({ supportsContainers: false, cloudDomain: null }), null);
  });

  it("n'applique jamais une réparation de conteneur à une instance cloud", () => {
    assert.equal(shouldRepairRouterMikhmon("mikhmon", true), false);
    assert.equal(shouldRepairRouterMikhmon("mikhmon", false), true);
    assert.equal(shouldRepairRouterMikhmon("ssh", true), false);
  });
});
