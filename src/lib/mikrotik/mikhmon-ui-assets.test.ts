import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { UI_FILES } from "./mikhmon-auto-update";

// Les assets servis (public/mikhmon-ui, déposés via /tool fetch) DOIVENT rester
// identiques aux fichiers de l'image (deploy/mikhmon-v7-ui) : sinon la refonte
// d'habillage (dépôt de fichiers) et la refonte totale (image) divergent.
const ROOT = join(__dirname, "..", "..", "..");
const pairs: [string, string][] = [
  ["public/mikhmon-ui/safelink-skin.css", "deploy/mikhmon-v7-ui/safelink-skin.css"],
  ["public/mikhmon-ui/mikhmon-responsive.css", "deploy/mikhmon-v7-ui/mikhmon-responsive.css"],
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

// Le piège qui a coûté le responsive au parc : mikhmon-responsive.css était
// chargé par headhtml.php et vivait sur COUZA, mais n'était NI dans le dépôt NI
// dans UI_FILES — aucun autre routeur ne l'a jamais reçu. Un asset posé dans
// public/mikhmon-ui/ sans entrée UI_FILES n'est déposé sur AUCUN routeur.
test("tout asset de public/mikhmon-ui est bien distribué (présent dans UI_FILES)", () => {
  const served = new Set(UI_FILES.map((f) => f.url.replace(/^mikhmon-ui\//, "")));
  const onDisk = readdirSync(join(ROOT, "public/mikhmon-ui"));
  for (const file of onDisk) {
    assert.ok(served.has(file), `public/mikhmon-ui/${file} n'est dans aucune entrée UI_FILES`);
  }
});
