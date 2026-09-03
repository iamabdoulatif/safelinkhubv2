import assert from "node:assert/strict";
import test from "node:test";
import { materializeRoamingDeviceOnRouter } from "./mac-propagate";

test("matérialise une liaison MAC sans épingler le code, et crée son compagnon", async () => {
  const calls: string[][] = [];
  const client = {
    talk: async (sentence: string[]) => {
      calls.push(sentence);
      if (sentence[0] === "/ip/hotspot/user/print" && sentence[1] === "?name=latif") {
        return [{ ".id": "*code", name: "latif", "mac-address": "" }];
      }
      if (sentence[0] === "/ip/hotspot/user/print" && sentence[1] === "?name=AA:BB:CC:DD:EE:FF") {
        return [];
      }
      return [];
    },
  };

  await materializeRoamingDeviceOnRouter(client as never, {
    username: "latif",
    mac: "AA:BB:CC:DD:EE:FF",
    profileName: "ROAM-TECH-ILLIMITE",
    macComment: "roam latif",
  });

  // Épingler le ticket sur une MAC le rendrait inutilisable depuis une autre
  // adresse — or les téléphones en changent d'un SSID (donc d'une zone) à l'autre.
  assert.ok(
    !calls.some((sentence) => sentence.includes("=mac-address=AA:BB:CC:DD:EE:FF") && sentence.includes("=.id=*code")),
  );
  const companion = calls.find((sentence) => sentence[0] === "/ip/hotspot/user/add");
  assert.ok(companion);
  assert.ok(companion.includes("=name=AA:BB:CC:DD:EE:FF"));
  assert.ok(companion.includes("=profile=ROAM-TECH-ILLIMITE"));
});

test("ne déclare pas une liaison prête si le code n'existe pas sur le routeur", async () => {
  await assert.rejects(
    materializeRoamingDeviceOnRouter(
      { talk: async () => [] } as never,
      {
        username: "latif",
        mac: "AA:BB:CC:DD:EE:FF",
        profileName: "ROAM-TECH-ILLIMITE",
        macComment: "roam latif",
      },
    ),
    /absent/,
  );
});

test("délie un ticket qui avait été épinglé sur une MAC", async () => {
  const calls: string[][] = [];
  const client = {
    talk: async (sentence: string[]) => {
      calls.push(sentence);
      if (sentence[0] === "/ip/hotspot/user/print" && sentence[1] === "?name=latif") {
        return [{ ".id": "*code", name: "latif", "mac-address": "11:22:33:44:55:66" }];
      }
      return [];
    },
  };

  await materializeRoamingDeviceOnRouter(client as never, {
    username: "latif",
    mac: "AA:BB:CC:DD:EE:FF",
    profileName: "ROAM-TECH-ILLIMITE",
    macComment: "roam latif",
  });

  assert.ok(
    calls.some(
      (sentence) =>
        sentence[0] === "/ip/hotspot/user/set" &&
        sentence.includes("=.id=*code") &&
        sentence.includes("=mac-address="),
    ),
    "le ticket doit être délié",
  );
});
