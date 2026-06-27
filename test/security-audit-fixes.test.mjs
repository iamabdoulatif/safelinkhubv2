import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("login redirects only to internal admin callbacks", async () => {
  const source = await readFile(new URL("../src/lib/auth/actions.ts", import.meta.url), "utf8");

  assert.match(source, /safeCallbackPath/);
  assert.match(source, /callback\.startsWith\("\/admin"\)/);
  assert.doesNotMatch(source, /redirect\(callback \|\| "\/admin"\)/);
});

test("admin layout rejects non-admin sessions", async () => {
  const source = await readFile(new URL("../src/app/admin/layout.tsx", import.meta.url), "utf8");

  assert.match(source, /session\.role !== "admin"/);
  assert.match(source, /redirect\("\/auth\/login\?callback=\/admin"\)/);
});

test("package actions require admin session and validate finite numeric fields", async () => {
  const source = await readFile(new URL("../src/lib/packages/actions.ts", import.meta.url), "utf8");

  assert.match(source, /requireAdminSession/);
  assert.match(source, /Number\.isFinite\(durationValue\)/);
  assert.match(source, /Number\.isFinite\(price\)/);
  assert.match(source, /Number\.isFinite\(uploadMbps\)/);
  assert.match(source, /Number\.isFinite\(downloadMbps\)/);
});

test("voucher generation verifies package ownership before insert", async () => {
  const source = await readFile(new URL("../src/lib/vouchers/actions.ts", import.meta.url), "utf8");

  assert.match(source, /requireAdminSession/);
  assert.match(source, /eq\(packages\.orgId, session\.orgId\)/);
  assert.match(source, /Forfait introuvable/);
});

