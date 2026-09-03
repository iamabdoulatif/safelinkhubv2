import assert from "node:assert/strict";
import test from "node:test";
import { findHotspotUser, purgeHotspotAccount } from "./hotspot-user";

test("does not turn a RouterOS read failure into a missing hotspot user", async () => {
  await assert.rejects(
    findHotspotUser(
      {
        talk: async () => {
          throw new Error("RouterOS unavailable");
        },
      },
      "adamo",
    ),
    /RouterOS unavailable/,
  );
});

test("returns null only when RouterOS confirmed that a hotspot user is absent", async () => {
  const user = await findHotspotUser({ talk: async () => [] }, "adamo");
  assert.equal(user, null);
});

/** Client RouterOS simulé : enregistre les commandes et rejoue des réponses. */
function fakeClient(reponses: Record<string, Record<string, string>[]>) {
  const commandes: string[][] = [];
  return {
    commandes,
    async talk(words: string[]) {
      commandes.push(words);
      const clef = words[0] + (words[1] ? ` ${words[1]}` : "");
      return reponses[clef] ?? reponses[words[0]] ?? [];
    },
  };
}

test("la purge coupe les sessions, le compte, puis le compagnon mac-cookie", async () => {
  // RouterOS crée au premier login une SECONDE entrée nommée d'après la MAC.
  // L'oublier laisse l'appareil se reconnecter seul : l'accès survivrait à une
  // révocation annoncée comme complète.
  const client = fakeClient({
    "/ip/hotspot/user/print ?name=alice": [{ ".id": "*1", "mac-address": "AA:BB:CC:DD:EE:FF" }],
    "/ip/hotspot/user/print ?name=AA:BB:CC:DD:EE:FF": [{ ".id": "*9" }],
    "/ip/hotspot/active/print ?user=alice": [{ ".id": "*5" }],
  });

  assert.equal(await purgeHotspotAccount(client, "alice"), true);
  const emises = client.commandes.map((c) => c.join(" "));
  assert.ok(emises.includes("/ip/hotspot/active/remove =.id=*5"), "session non fermée");
  assert.ok(emises.includes("/ip/hotspot/user/remove =.id=*1"), "compte non supprimé");
  assert.ok(emises.includes("/ip/hotspot/user/remove =.id=*9"), "compagnon mac-cookie oublié");
  // Le compte part AVANT son compagnon : l'inverse laisserait une fenêtre où
  // la MAC seule suffit encore à ouvrir la session.
  assert.ok(
    emises.indexOf("/ip/hotspot/user/remove =.id=*1") <
      emises.indexOf("/ip/hotspot/user/remove =.id=*9"),
  );
});

test("sans MAC mémorisée, la purge ne cherche aucun compagnon", async () => {
  for (const mac of ["", "00:00:00:00:00:00"]) {
    const client = fakeClient({
      "/ip/hotspot/user/print ?name=bob": [{ ".id": "*2", "mac-address": mac }],
    });
    assert.equal(await purgeHotspotAccount(client, "bob"), true);
    const recherches = client.commandes.filter((c) => c[0] === "/ip/hotspot/user/print");
    assert.equal(recherches.length, 1, `une seule recherche attendue pour « ${mac} »`);
  }
});

test("un compte absent n'est pas signalé comme supprimé", async () => {
  const client = fakeClient({});
  assert.equal(await purgeHotspotAccount(client, "fantome"), false);
  assert.equal(client.commandes.filter((c) => c[0].endsWith("/remove")).length, 0);
});

test("une panne de transport remonte au lieu de passer pour une suppression", async () => {
  // C'est la distinction qui protège l'utilisateur : « injoignable, donc
  // peut-être encore actif » ne doit jamais être confondu avec « supprimé ».
  const client = {
    async talk(words: string[]) {
      if (words[0] === "/ip/hotspot/user/print") {
        return [{ ".id": "*3", "mac-address": "" }] as Record<string, string>[];
      }
      throw new Error("tunnel timeout");
    },
  };
  await assert.rejects(() => purgeHotspotAccount(client, "carol"), /tunnel timeout/);
});


test("la purge efface aussi les compagnons des MAC connues en base", async () => {
  // Le ticket ne porte plus de mac-address : sans les MAC transmises, un
  // compagnon oublié laisserait l'appareil s'auto-loguer après révocation.
  const client = fakeClient({
    "/ip/hotspot/user/print ?name=adamo": [{ ".id": "*1", name: "adamo", "mac-address": "" }],
    "/ip/hotspot/user/print ?name=AA:BB:CC:DD:EE:FF": [{ ".id": "*2", name: "AA:BB:CC:DD:EE:FF" }],
    "/ip/hotspot/user/print ?name=11:22:33:44:55:66": [{ ".id": "*3", name: "11:22:33:44:55:66" }],
  });

  await purgeHotspotAccount(client, "adamo", ["AA:BB:CC:DD:EE:FF", "11:22:33:44:55:66"]);

  const removed = client.commandes
    .filter((c) => c[0] === "/ip/hotspot/user/remove")
    .map((c) => c[1]);
  assert.deepEqual(removed, ["=.id=*1", "=.id=*2", "=.id=*3"]);
});
