import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MIGRATIONS } from "./migrations";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");

/** Normalise pour comparer le SQL au-delà des commentaires et des espaces. */
function normalizeSql(sql: string): string {
  return sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, "").trim())
    .filter((l) => l.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

describe("registre des migrations", () => {
  it("les identifiants sont uniques et ordonnés", () => {
    const ids = MIGRATIONS.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length, "identifiants dupliqués");
    assert.deepEqual(ids, [...ids].sort(), "les migrations doivent être ordonnées par id");
  });

  it("aucune migration n'est vide", () => {
    for (const m of MIGRATIONS) assert.ok(m.sql.trim().length > 0, `${m.id} est vide`);
  });

  // Le SQL embarqué (joué au démarrage) et le fichier .sql (miroir humain /
  // secours manuel) ne doivent pas diverger : un correctif appliqué à l'un sans
  // l'autre reposerait un piège de dérive de schéma.
  const MIRRORS: Record<string, string> = {
    "0001_link_usage": "add-link-usage.sql",
    "0002_zone_per_client": "add-zone-per-client.sql",
  };
  for (const [id, file] of Object.entries(MIRRORS)) {
    it(`${id} : le miroir scripts/${file} correspond`, () => {
      const embedded = normalizeSql(MIGRATIONS.find((m) => m.id === id)!.sql);
      const mirror = normalizeSql(readFileSync(join(repoRoot, "scripts", file), "utf8"));
      assert.equal(mirror, embedded);
    });
  }
});
