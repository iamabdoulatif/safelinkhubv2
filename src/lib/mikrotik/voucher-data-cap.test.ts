import assert from "node:assert/strict";
import test from "node:test";
import { dataCapLabel, dataCapWords } from "./voucher-data-cap";

test("3 Go se traduit en octets, pas en mégaoctets", () => {
  // 3072 Mo × 1024² — la faute classique est d'envoyer 3072 à RouterOS, qui
  // couperait le client au bout de 3 Ko.
  assert.deepEqual(dataCapWords(3072), ["=limit-bytes-total=3221225472"]);
});

test("aucun plafond n'émet AUCUN mot", () => {
  // Émettre `=limit-bytes-total=0` serait « illimité » côté RouterOS, mais
  // écraserait un plafond posé à la main sur le routeur. Rien à dire = rien
  // à écrire.
  for (const vide of [null, undefined, 0, -1, Number.NaN]) {
    assert.deepEqual(dataCapWords(vide as number | null | undefined), []);
  }
});

test("le mot est un entier d'octets", () => {
  const [mot] = dataCapWords(1536);
  assert.match(mot, /^=limit-bytes-total=\d+$/);
  assert.equal(mot, `=limit-bytes-total=${1536 * 1024 * 1024}`);
});

test("le libellé se lit en Go dès que c'est rond", () => {
  assert.equal(dataCapLabel(3072), "3 Go");
  assert.equal(dataCapLabel(1024), "1 Go");
  assert.equal(dataCapLabel(1536), "1,5 Go");
  assert.equal(dataCapLabel(500), "500 Mo");
  assert.equal(dataCapLabel(null), null);
  assert.equal(dataCapLabel(0), null);
});
