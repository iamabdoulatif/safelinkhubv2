import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureVoucherProfileOnRouter } from "./voucher-profile-provision";
import { buildUnlimitedProfile } from "./voucher-profiles";

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

  it("ne pose NI on-login NI planificateur pour un profil illimité", async () => {
    const calls: string[][] = [];
    const client = {
      talk: async (sentence: string[]) => {
        calls.push(sentence);
        return [] as Record<string, string>[];
      },
    };

    await ensureVoucherProfileOnRouter(
      client as never,
      buildUnlimitedProfile({ uploadMbps: 20, downloadMbps: 20 }),
    );

    const profileAdd = calls.find((sentence) => sentence[0] === "/ip/hotspot/user/profile/add");
    assert.ok(profileAdd, "le profil doit être créé");
    assert.equal(profileAdd.includes("=name=ILLIMITE"), true);
    assert.ok(profileAdd.includes("=rate-limit=20M/20M"));

    // Ce sont les DEUX mécanismes qui effacent un compte à échéance. Un compte
    // d'administrateur ou de technicien ne doit tomber sous aucun des deux :
    // pas de session coupée en pleine intervention, pas de compte qui
    // disparaît du routeur.
    assert.ok(
      !profileAdd.some((word) => word.startsWith("=on-login=")),
      "un profil illimité ne doit porter aucun on-login",
    );
    assert.ok(
      !calls.some((sentence) => sentence[0] === "/system/scheduler/add"),
      "un profil illimité ne doit créer aucun planificateur de balayage",
    );
  });

  it("garde bien l'expiration pour un profil à durée", async () => {
    const calls: string[][] = [];
    const client = {
      talk: async (sentence: string[]) => {
        calls.push(sentence);
        return [] as Record<string, string>[];
      },
    };

    await ensureVoucherProfileOnRouter(client as never, {
      name: "01-JOUR",
      label: "1 jour",
      durationCode: "1d",
      onLogin: ":put expiry",
      monitorInterval: "2m20s",
      monitorOnEvent: ":put sweep",
    });

    const profileAdd = calls.find((sentence) => sentence[0] === "/ip/hotspot/user/profile/add");
    assert.ok(profileAdd?.includes("=on-login=:put expiry"));
    assert.ok(calls.some((sentence) => sentence[0] === "/system/scheduler/add"));
  });
});
