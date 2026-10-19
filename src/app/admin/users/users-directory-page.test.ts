import assert from "node:assert/strict";
import { test } from "node:test";
import { userDirectoryPage } from "./users-directory-page";
test("pagination preserves original filtered rows and clamps stale pages", () => {
  const rows = Array.from({ length: 45 }, (_, id) => ({ id }));
  assert.deepEqual(
    userDirectoryPage(rows, 1).rows.map((r) => r.id),
    Array.from({ length: 20 }, (_, i) => i + 20),
  );
  assert.equal(rows.length, 45);
  const last = userDirectoryPage(rows, 99);
  assert.equal(last.page, 2);
  assert.equal(last.start, 41);
  assert.equal(last.end, 45);
  const empty = userDirectoryPage([], 99);
  assert.equal(empty.start, 0);
  assert.equal(empty.end, 0);
  assert.equal(empty.pageCount, 1);
});
