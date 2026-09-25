import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const racine = new URL("../src/app/api/mobile/v1/", import.meta.url);

async function routes(dir = racine, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const u = new URL(e.name + (e.isDirectory() ? "/" : ""), dir);
    if (e.isDirectory()) await routes(u, out);
    else if (e.name === "route.ts") out.push(u);
  }
  return out;
}

// Seules la connexion et l'étape MFA se passent de jeton.
const PUBLIQUES = ["auth/login/route.ts", "auth/mfa/route.ts"];

test("toute route mobile exige un jeton, sauf la connexion", async () => {
  const fichiers = await routes();
  assert.ok(fichiers.length >= 7);
  for (const f of fichiers) {
    const chemin = f.pathname.slice(racine.pathname.length);
    if (PUBLIQUES.includes(chemin)) continue;
    const src = await readFile(f, "utf8");
    assert.match(src, /await requireMobileSession\(/, `${chemin} n'exige pas de jeton`);
  }
});

test("l'API mobile n'expose jamais les identifiants des routeurs", async () => {
  const champs = await readFile(new URL("../src/lib/mobile/routers.ts", import.meta.url), "utf8");
  assert.doesNotMatch(champs, /password|username|host:/i);
  for (const f of await routes()) {
    assert.doesNotMatch(await readFile(f, "utf8"), /passwordEncrypted|\.select\(\)\s*\.from\(routers\)/);
  }
});
