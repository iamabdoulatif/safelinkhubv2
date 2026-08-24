import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("un superadmin rafraîchit TOUT le parc, pas seulement son organisation", async () => {
  /* Mesuré en production le 2026-08-24 : HSPT-GALAXY et HSPT-SAKONG
     répondaient au ping, leur API 8728 était ouverte et leur poignée de main
     WireGuard datait d'une minute — l'écran les donnait hors ligne depuis
     treize heures, parce que rien ne les re-sondait entre deux passages du
     cron quotidien. */
  const page = await read("src/app/admin/router/page.tsx");
  assert.match(page, /refreshStaleRouters\(superadmin \? null : session\.orgId\)/);
  // Le rôle doit être résolu AVANT l'appel, sinon la portée est toujours l'org.
  assert.ok(
    page.indexOf("const superadmin =") < page.indexOf("refreshStaleRouters("),
    "superadmin doit être calculé avant le rafraîchissement",
  );
});

test("le rafraîchissement admet la portée « tout le parc »", async () => {
  const src = await read("src/lib/mikrotik/router-sync.ts");
  const fn = src.slice(src.indexOf("export async function refreshStaleRouters"));
  assert.match(fn, /orgId: string \| null/);
  // null ne doit pas devenir un filtre `org_id = null`, qui ne rendrait RIEN.
  assert.match(fn, /orgId === null \? undefined : eq\(routers\.orgId, orgId\)/);
});

test("les sondes restent plafonnées — sinon le correctif crée la panne", async () => {
  /* Le relais tient 1 vCPU : une douzaine de poignées de main SSH simultanées
     se privent mutuellement de CPU et produisent des « Read timed out » qui
     marquent hors ligne des routeurs sains. Passer de « une organisation » à
     « tout le parc » sans plafond aurait donc reproduit le bug corrigé. */
  const src = await read("src/lib/mikrotik/router-sync.ts");
  const fn = src.slice(src.indexOf("export async function refreshStaleRouters"));
  assert.doesNotMatch(
    fn,
    /Promise\.all\(\s*candidates\.map/,
    "plus de Promise.all non borné sur tout le parc",
  );
  assert.match(fn, /REFRESH_CONCURRENCY/);
  const plafond = src.match(/const REFRESH_CONCURRENCY = (\d+)/);
  assert.ok(plafond && Number(plafond[1]) <= 4, "le plafond doit rester au niveau du cron (≤ 4)");
});

test("les écrans mono-organisation gardent leur portée", async () => {
  // Ils n'affichent que les routeurs du visiteur : élargir y serait du travail
  // inutile sur des lignes que la page ne montre pas.
  for (const f of [
    "src/app/admin/remote-access/page.tsx",
    "src/app/admin/settings/captive-templates/page.tsx",
  ]) {
    assert.match(await read(f), /refreshStaleRouters\(session\.orgId\)/, f);
  }
});
