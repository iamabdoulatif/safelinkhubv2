import assert from "node:assert/strict";
import test from "node:test";
import { revokeRoamingTargets } from "./revocation";

test("starts every roaming revocation without waiting for another zone", async () => {
  const started: string[] = [];
  let releaseNorth: (() => void) | undefined;
  const northFinished = new Promise<void>((resolve) => {
    releaseNorth = resolve;
  });

  const pending = revokeRoamingTargets(
    [{ name: "NORD" }, { name: "SUD" }],
    async (target) => {
      started.push(target.name);
      if (target.name === "NORD") await northFinished;
    },
  );

  assert.deepEqual(started, ["NORD", "SUD"]);
  releaseNorth?.();
  assert.deepEqual(await pending, { removedOn: 2, unreachable: [] });
});

test("keeps a failed roaming zone visible for a safe retry", async () => {
  const result = await revokeRoamingTargets(
    [{ name: "NORD" }, { name: "SUD" }],
    async (target) => {
      if (target.name === "NORD") throw new Error("tunnel timeout");
    },
  );

  assert.deepEqual(result, { removedOn: 1, unreachable: ["NORD"] });
});
