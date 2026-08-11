import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureVoucherProfileOnRouter } from "./voucher-profile-provision";

describe("provisionnement de profil voucher", () => {
  it("écrit la limite de débit du profil sur RouterOS", async () => {
    const calls: string[][] = [];
    const client = {
      talk: async (sentence: string[]) => {
        calls.push(sentence);
        return [] as Record<string, string>[];
      },
    };

    await ensureVoucherProfileOnRouter(client as never, {
      name: "ROAM-A1B2-01-JOUR",
      label: "1 jour",
      durationCode: "1d",
      onLogin: ":put test",
      monitorInterval: "2m20s",
      monitorOnEvent: ":put monitor",
      rateLimit: "2M/5M",
    });

    const profileAdd = calls.find((sentence) => sentence[0] === "/ip/hotspot/user/profile/add");
    assert.ok(profileAdd);
    assert.ok(profileAdd.includes("=rate-limit=2M/5M"));
    assert.ok(profileAdd.includes("=add-mac-cookie=yes"));
  });
});
