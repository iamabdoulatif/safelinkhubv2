import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const workspacePath = new URL("../src/app/admin/remote-access/[id]/page.tsx", import.meta.url);
const directAccessPath = new URL("../src/app/admin/remote-access/DirectAccessSection.tsx", import.meta.url);

test("l’espace routeur borne chaque opération à l’organisation de la session", async () => {
  const source = await readFile(workspacePath, "utf8");
  assert.match(source, /eq\(routers\.id, id\)/);
  assert.match(source, /eq\(routers\.orgId, session\.orgId\)/);
  assert.match(source, /notFound\(\)/);
  assert.match(source, /<DirectAccessSection/);
  assert.match(source, /<BackToHomeSection/);
  // Le bypass IPv6 a été retiré du produit : la page ne doit plus le monter.
  assert.doesNotMatch(source, /Ipv6BypassSection/);
  assert.match(source, /<RouterReplacementSection/);
});

test("les changements d’accès direct passent par une confirmation nommée", async () => {
  const source = await readFile(directAccessPath, "utf8");
  assert.match(source, /const \[confirmation, setConfirmation\]/);
  assert.match(source, /Confirmer l’activation/);
  assert.match(source, /Confirmer la révocation/);
  assert.match(source, /role="dialog"/);
});

test("l'IPv6 a quitté le produit, sauf le décodage d'une URL", async () => {
  /* Deux fonctionnalités retirées à la demande : le « Bypass IPv6 » (nœud de
     sortie par le relais) et la fermeture de la FUITE IPv6 du portail captif.
     Ce test empêche qu'un morceau revienne par recopie sans décision.

     La seule mention tolérée est le retrait des crochets d'une IPv6 littérale
     dans walled-garden.ts : c'est de l'analyse d'URL, pas une fonctionnalité. */
  const { readdir } = await import("node:fs/promises");
  const racine = new URL("../src/", import.meta.url);
  const fautes = [];
  async function descendre(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const enfant = new URL(e.name + (e.isDirectory() ? "/" : ""), dir);
      if (e.isDirectory()) {
        await descendre(enfant);
        continue;
      }
      if (!/\.tsx?$/.test(e.name)) continue;
      const chemin = enfant.pathname.slice(racine.pathname.length);
      if (chemin === "lib/mikrotik/walled-garden.ts") continue;
      const src = await readFile(enfant, "utf8");
      if (/ipv6/i.test(src)) fautes.push(chemin);
    }
  }
  await descendre(racine);
  assert.deepEqual(fautes, [], `IPv6 encore présent :\n${fautes.join("\n")}`);
});
