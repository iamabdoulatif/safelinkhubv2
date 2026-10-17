import assert from "node:assert/strict";
import { test } from "node:test";
import { suggestedStarlinkLinks } from "./starlink-fup-presets";

test("confirmed cycles include the final day and keep independent WANs", () => {
  const [standard, mini] = suggestedStarlinkLinks("0c1fea72-50fb-4593-a740-ea2a3fe49c5f");
  assert.equal(standard.cycleStart.slice(0, 10), "2026-09-21");
  assert.equal(standard.cycleEnd.slice(0, 10), "2026-10-21");
  assert.equal(mini.cycleStart.slice(0, 10), "2026-10-10");
  assert.equal(mini.cycleEnd.slice(0, 10), "2026-11-10");
  assert.notEqual(standard.interface, mini.interface);
  assert.deepEqual(suggestedStarlinkLinks("unrelated"), []);
});
