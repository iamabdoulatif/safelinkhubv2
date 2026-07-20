import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { voucherProfileForPackage } from "./package-voucher-profile";

describe("profil voucher roaming", () => {
  it("isole le profil RouterOS d'un groupe et applique ses débits", () => {
    const profile = voucherProfileForPackage(1, "Days", 300, {
      name: "ROAM-A1B2-01-JOUR",
      uploadMbps: 2,
      downloadMbps: 5,
    });

    assert.equal(profile?.name, "ROAM-A1B2-01-JOUR");
    assert.equal(profile?.rateLimit, "2M/5M");
    assert.match(profile?.onLogin ?? "", /,300,1d,300,/);
    assert.match(profile?.monitorOnEvent ?? "", /profile="ROAM-A1B2-01-JOUR"/);
  });
});
