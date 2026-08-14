import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("hosted purchase route", () => {
  it("scopes the selected router to the package organisation before rendering payment UI", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");

    assert.match(source, /\brouters\b/);
    assert.match(source, /\.innerJoin\(\s*routers,\s*and\(/);
    assert.match(source, /eq\(routers\.id,\s*routerId\)/);
    assert.match(source, /eq\(routers\.orgId,\s*organizations\.id\)/);
  });
});
