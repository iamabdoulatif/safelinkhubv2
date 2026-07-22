import test from "node:test";
import assert from "node:assert/strict";
import { parseSafecoinTopupAmount, safecoinTopupScCents } from "./topup";

test("une recharge calcule le crédit SC côté serveur", () => {
  assert.equal(parseSafecoinTopupAmount("1000"), 1000);
  assert.equal(safecoinTopupScCents(1000, 100), 1000);
});

test("refuse les montants de recharge invalides", () => {
  assert.throws(() => parseSafecoinTopupAmount("0"), /supérieur/);
  assert.throws(() => parseSafecoinTopupAmount("abc"), /supérieur/);
});
