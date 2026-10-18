import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readTrafficObservation,
  enableTrafficGraphing,
} from "./traffic-reader";
import type { RouterOSClient } from "./client";

test("reader preserves WAN directions, hashes clients, and detects applied limits without provider claims", async () => {
  const calls: string[][] = [];
  const client = {
    async talk(words: string[]) {
      calls.push(words);
      if (words[0] === "/interface/print")
        return [
          {
            name: "ether1",
            "rx-byte": "1500",
            "tx-byte": "200",
            running: "true",
          },
        ];
      if (words[0] === "/system/resource/print") return [{ uptime: "2d3h" }];
      if (words[0] === "/ip/hotspot/active/print")
        return [
          {
            ".id": "*1",
            user: "private-user",
            "mac-address": "aa:bb",
            "bytes-in": "10",
            "bytes-out": "20",
          },
        ];
      if (words[0] === "/queue/simple/print")
        return [
          {
            name: "slh-fup-shared",
            "max-limit": "100k/200k",
            disabled: "false",
          },
        ];
      return [];
    },
  } as unknown as RouterOSClient;
  const result = await readTrafficObservation(client, "router", [
    { id: "wan", name: "Starlink", interface: "ether1" },
  ]);
  assert.equal(result.links[0].rx, 1500);
  assert.equal(result.clients && Object.values(result.clients)[0], 30);
  assert.ok(!JSON.stringify(result.clients).includes("private-user"));
  assert.equal(result.conditions[0].certainty, "confirmed");
  assert.ok(result.conditions.every((c) => c.source !== "starlink"));
  assert.ok(calls.every((c) => c[0].endsWith("/print")));
});
test("missing or invalid counter never becomes zero; failed client reading remains unknown", async () => {
  const client = {
    async talk(words: string[]) {
      if (words[0] === "/ip/hotspot/active/print") throw Error("unavailable");
      if (words[0] === "/interface/print")
        return [{ name: "ether1", "rx-byte": "no-value", running: "false" }];
      return [];
    },
  } as unknown as RouterOSClient;
  const result = await readTrafficObservation(client, "router", [
    { id: "wan", name: "Starlink", interface: "ether1" },
  ]);
  assert.equal(result.links[0].rx, null);
  assert.equal(result.links[0].tx, null);
  assert.equal(result.clients, null);
  assert.equal(result.conditions[0].kind, "outage");
});
test("graphing only adds private per-interface rules and a repeated activation is idempotent", async () => {
  const calls: string[][] = [];
  const rules: Record<string, string>[] = [];
  const client = {
    async talk(words: string[]) {
      calls.push(words);
      if (words[0] === "/interface/print") return [{ name: "ether1" }];
      if (words[0] === "/tool/graphing/interface/print") return rules;
      if (words[0] === "/tool/graphing/interface/add")
        rules.push({
          ".id": "*1",
          interface: "ether1",
          "allow-address": "10.1.0.0/24",
          "store-on-disk": "true",
          disabled: "false",
        });
      return [];
    },
  } as unknown as RouterOSClient;
  await enableTrafficGraphing(client, ["ether1"], "10.1.0.0/24");
  await enableTrafficGraphing(client, ["ether1"], "10.1.0.0/24");
  assert.equal(calls.filter((c) => c[0].endsWith("/add")).length, 1);
  assert.ok(!calls.some((c) => c.includes("=allow-address=0.0.0.0/0")));
  await assert.rejects(enableTrafficGraphing(client, ["ether1"], "0.0.0.0/0"));
});
