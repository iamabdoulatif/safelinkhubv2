import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { adminFr } from "../src/lib/i18n/admin/fr.ts";
import { adminEn } from "../src/lib/i18n/admin/en.ts";

function leaves(value, path = "") {
  if (typeof value === "function") return [[path, `function:${value.length}`]];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) =>
      leaves(child, path ? `${path}.${key}` : key),
    );
  }
  return [[path, typeof value]];
}

test("the French and English admin dictionaries have matching text leaves", () => {
  assert.deepEqual(leaves(adminEn), leaves(adminFr));
});

test("the admin shell resolves interpolation before passing navigation to the client", async () => {
  const layout = await readFile(
    new URL("../src/app/admin/layout.tsx", import.meta.url),
    "utf8",
  );

  assert.match(layout, /const \{ pendingBadge, \.\.\.nav \} = dict\.nav/);
  assert.doesNotMatch(layout, /nav=\{dict\.nav\}/);
});
