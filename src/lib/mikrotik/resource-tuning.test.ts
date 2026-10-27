import assert from "node:assert/strict";
import { test } from "node:test";
import { buildJournalCapScript, JOURNAL_CAP_NAME } from "./resource-tuning";

const src = buildJournalCapScript(3, 5000);

test("buildJournalCapScript : ne vise QUE le journal MikHmon", () => {
  assert.ok(src.includes('/system script find where comment="mikhmon"'));
});

test("buildJournalCapScript : injecte rétention et plafond", () => {
  assert.ok(src.includes(":local cap 5000"));
  assert.ok(src.includes("$cm - 3")); // keepMonths
});

test("buildJournalCapScript : lit l'horloge ISO et legacy", () => {
  assert.ok(src.includes('[:pick $d 4 5]="-"')); // 2026-10-27
  assert.ok(src.includes("[:pick $d 0 3]")); // oct/27/2026
});

test("buildJournalCapScript : garde-fou, ne supprime jamais un nom illisible", () => {
  assert.ok(src.includes("$yr >= 2020"));
  assert.ok(src.includes('[:typeof $yr]="num"'));
  // suppression conditionnée à la comparaison de date, jamais inconditionnelle
  assert.ok(src.includes("< $cutoff) do={ /system script remove $s"));
});

test("buildJournalCapScript : borne le travail au plafond", () => {
  assert.ok(src.includes("$n < $cap"));
  assert.ok(src.includes(`${JOURNAL_CAP_NAME} removed=`));
});
