import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("la migration Safecoin contient les tables et contraintes critiques", () => {
  const sql = readFileSync("scripts/add-safecoin.sql", "utf8");
  for (const token of [
    "CREATE TABLE IF NOT EXISTS safecoin_settings",
    "CREATE TABLE IF NOT EXISTS safecoin_accounts",
    "CREATE TABLE IF NOT EXISTS safecoin_ledger",
    "balance_sc_cents",
    "amount_sc_cents",
    "reference_fcfa_cents",
    "idempotency_key",
    "UNIQUE (idempotency_key)",
  ]) {
    assert.match(sql, new RegExp(token.replace(/[()]/g, "\\$&")));
  }
});
