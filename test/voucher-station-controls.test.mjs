import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const readActions = () =>
  readFile(new URL("../src/lib/vouchers/actions.ts", import.meta.url), "utf8");

test("l'archivage est limité à l'organisation et ne contacte pas RouterOS", async () => {
  const source = await readActions();

  assert.match(source, /export async function archiveVouchers/);
  assert.match(source, /requireAdminSession\(\)/);
  assert.match(source, /eq\(vouchers\.orgId, session\.orgId\)/);
  assert.match(source, /deletedAt: new Date\(\)/);
  assert.doesNotMatch(source, /archiveVouchers[\s\S]*removeHotspotUser/);
});

test("la restauration ne traite que les tickets archivés de l'organisation", async () => {
  const source = await readActions();

  assert.match(source, /export async function restoreVouchers/);
  assert.match(source, /isNotNull\(vouchers\.deletedAt\)/);
  assert.match(source, /set\(\{ deletedAt: null \}\)/);
});
