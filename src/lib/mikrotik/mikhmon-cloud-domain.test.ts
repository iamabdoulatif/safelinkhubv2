import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cloudMikhmonDomain,
  cloudMikhmonPort,
  routerCloudSlug,
} from "./mikhmon-cloud-domain";

describe("MikHmon cloud domains", () => {
  it("fabrique un sous-domaine stable, sûr et non devinable", () => {
    assert.equal(
      routerCloudSlug("RB951 Korhogo", "123e4567-e89b-12d3-a456-426614174000"),
      "rb951-korhogo-14174000",
    );
    assert.equal(
      cloudMikhmonDomain("rb951-korhogo-42661417", "mikhmon.safelinkhub.io"),
      "rb951-korhogo-42661417.mikhmon.safelinkhub.io",
    );
  });

  it("refuse une base de domaine ou un slug dangereux", () => {
    assert.throws(() => cloudMikhmonDomain("../../etc", "mikhmon.safelinkhub.io"));
    assert.throws(() => cloudMikhmonDomain("rb951", "https://mikhmon.safelinkhub.io/path"));
  });

  it("attribue uniquement des ports loopback dans le pool cloud", () => {
    assert.equal(cloudMikhmonPort([]), 20_000);
    assert.equal(cloudMikhmonPort([20_000, 20_001, 20_003]), 20_002);
  });
});
