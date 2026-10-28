import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Les assets servis (public/mikhmon-ui, déposés via /tool fetch) DOIVENT rester
// identiques aux fichiers de l'image (deploy/mikhmon-v7-ui) : sinon la refonte
// d'habillage (dépôt de fichiers) et la refonte totale (image) divergent.
const ROOT = join(__dirname, "..", "..", "..");
const pairs: [string, string][] = [
  ["public/mikhmon-ui/safelink-skin.css", "deploy/mikhmon-v7-ui/safelink-skin.css"],
  ["public/mikhmon-ui/headhtml.txt", "deploy/mikhmon-v7-ui/headhtml.php"],
  ["public/mikhmon-ui/sessions.txt", "deploy/mikhmon-v7-ui/sessions.php"],
];

test("assets servis == fichiers de l'image (pas de dérive)", () => {
  for (const [served, image] of pairs) {
    assert.equal(
      readFileSync(join(ROOT, served), "utf8"),
      readFileSync(join(ROOT, image), "utf8"),
      `${served} doit être identique à ${image}`,
    );
  }
});
