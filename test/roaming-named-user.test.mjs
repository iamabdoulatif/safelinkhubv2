import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

import {
  isValidRoamingUsername,
  roamingUserPassword,
} from "../src/lib/roaming/forms.ts";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("un identifiant nominatif refuse ce qui casse les scripts RouterOS", () => {
  for (const ok of ["aroune", "tech.nord", "admin_01", "A-1", "ar"]) {
    assert.equal(isValidRoamingUsername(ok), true, `« ${ok} » devrait être accepté`);
  }
  // Espaces, accents, apostrophes et guillemets se retrouveraient tels quels
  // dans le on-login du profil et dans MikHmon.
  for (const ko of ["ar oune", "aroune!", "aroûne", "a", "o'brien", 'a"b', "x".repeat(33), ""]) {
    assert.equal(isValidRoamingUsername(ko), false, `« ${ko} » devrait être refusé`);
  }
});

test("un mot de passe vide reprend l'identifiant, jamais rien", () => {
  // Le cas de l'énoncé : aroune / aroune.
  assert.equal(roamingUserPassword("", "aroune"), "aroune");
  assert.equal(roamingUserPassword("   ", "aroune"), "aroune");
  // Un mot de passe explicite est conservé tel quel.
  assert.equal(roamingUserPassword("Secret2026", "aroune"), "Secret2026");
  // Et jamais de compte hotspot sans mot de passe : c'est un compte
  // d'administrateur, il ouvre le réseau à qui connaît le nom.
  assert.equal(roamingUserPassword("", "a"), null);
  assert.equal(roamingUserPassword("x".repeat(65), "aroune"), null);
});

test("le compte nominatif et le lot passent par la MÊME création", async () => {
  const actions = await read("src/lib/roaming/actions.ts");
  const provision = await read("src/lib/roaming/provision.ts");

  // Deux chemins de création, une seule mécanique : sinon les comptes créés à
  // la main finiraient par diverger des tickets vendus (options de profil,
  // auto-login inter-zones, règle du tout-ou-rien).
  assert.match(actions, /export async function generateRoamingVouchers/);
  assert.match(actions, /export async function createRoamingUser/);
  assert.equal(
    (actions.match(/provisionRoamingAccounts\(\{/g) ?? []).length,
    2,
    "les deux actions doivent appeler le provisionnement commun",
  );
  assert.doesNotMatch(
    actions,
    /\/ip\/hotspot\/user\/add/,
    "la création d'utilisateur hotspot ne doit plus être dupliquée dans actions.ts",
  );
  assert.equal(
    (provision.match(/"\/ip\/hotspot\/user\/add"/g) ?? []).length,
    1,
    "un seul endroit crée l'utilisateur hotspot",
  );

  // Le mot de passe posé sur le routeur est celui du compte, pas l'identifiant
  // recopié : c'est toute la différence entre un ticket et un compte nommé.
  assert.match(provision, /=password=\$\{password\}/);
  // Et le module partagé ne doit pas devenir un endpoint HTTP.
  assert.doesNotMatch(provision, /^"use server"/);
});

test("le compte nominatif est refusé avant d'atteindre les routeurs", async () => {
  const actions = await read("src/lib/roaming/actions.ts");
  const body = actions.slice(
    actions.indexOf("export async function createRoamingUser"),
    actions.indexOf("export async function revealRoamingUserPassword"),
  );
  // L'ordre compte : session, forme de l'identifiant, unicité en base, PUIS
  // seulement la connexion aux MikroTik.
  const order = ["requireAdminSession", "isValidRoamingUsername", "roamingUserPassword", "provisionRoamingAccounts"];
  let cursor = -1;
  for (const step of order) {
    const at = body.indexOf(step);
    assert.ok(at > cursor, `« ${step} » doit venir après l'étape précédente`);
    cursor = at;
  }
  assert.match(body, /déjà utilisé/, "un identifiant déjà pris doit être refusé explicitement");
});

test("le mot de passe est relu sur le routeur, pas stocké chez nous", async () => {
  const schema = await read("src/lib/db/schema.ts");
  const vouchers = schema.slice(schema.indexOf("export const vouchers = pgTable"));
  const columns = vouchers.slice(0, vouchers.indexOf("(t) =>"));
  assert.doesNotMatch(
    columns,
    /password/i,
    "aucune colonne de mot de passe : la source de vérité reste RouterOS",
  );

  const actions = await read("src/lib/roaming/actions.ts");
  assert.match(actions, /export async function revealRoamingUserPassword/);
  assert.match(actions, /\/ip\/hotspot\/user\/print/);
});
