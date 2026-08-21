import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

import {
  ROAMING_USERNAME_PATTERN,
  isValidRoamingUsername,
  roamingUserPassword,
} from "../src/lib/roaming/forms.ts";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("un identifiant nominatif accepte les formes demandées", () => {
  // Les cas de l'énoncé, arobase et tiret final compris.
  for (const ok of ["aroune", "latif@", "abou@", "karl-", "tech.nord", "admin_01", "A-1", "ar"]) {
    assert.equal(isValidRoamingUsername(ok), true, `« ${ok} » devrait être accepté`);
  }
});

test("un identifiant refuse ce qui couperait le webhook roaming", () => {
  // Le on-login renvoie l'identifiant dans un corps x-www-form-urlencoded
  // (« …&u=" . $user »), SANS encodage : ces caractères y couperaient le champ
  // ou injecteraient le suivant.
  for (const ko of ["a&b", "a=b", "a+b", "a%20b", "a?b", "a#b"]) {
    assert.equal(isValidRoamingUsername(ko), false, `« ${ko} » couperait le webhook`);
  }
  // Et le reste de ce qui n'a rien à faire dans un nom d'utilisateur hotspot.
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
  const commonProvision = provision.slice(
    provision.indexOf("export async function provisionRoamingAccounts"),
    provision.indexOf("export async function updateRoamingAccount"),
  );
  assert.equal(
    (commonProvision.match(/"\/ip\/hotspot\/user\/add"/g) ?? []).length,
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

test("la suppression révoque vraiment : session, compte, et compagnon MAC", async () => {
  const provision = await read("src/lib/roaming/provision.ts");
  const body = provision.slice(provision.indexOf("export async function deleteRoamingAccount"));

  // 1. La session en cours est coupée — sinon le compte reste connecté.
  assert.match(body, /\/ip\/hotspot\/active\/remove/);
  // 2. Le compte lui-même part.
  assert.match(body, /\/ip\/hotspot\/user\/remove/);
  // 3. Le compagnon `name=<MAC>` posé par la propagation inter-zones part aussi,
  //    sans quoi l'appareil continuerait de s'auto-loguer après révocation.
  assert.match(body, /mac-address/);
  assert.match(body, /findHotspotUser\(client, boundMac\)/);

  // Une zone muette interdit de retirer la ligne : on ne déclare pas révoqué un
  // compte qui fonctionne peut-être encore ailleurs.
  const guard = body.indexOf("if (unreachable.length > 0)");
  const del = body.indexOf("db.delete(vouchers)");
  assert.ok(guard > 0 && del > guard, "la garde doit précéder la suppression en base");
});

test("modifier n'efface rien par omission", async () => {
  const provision = await read("src/lib/roaming/provision.ts");
  const body = provision.slice(
    provision.indexOf("export async function updateRoamingAccount"),
    provision.indexOf("export async function deleteRoamingAccount"),
  );

  // Chaque champ n'est poussé sur le routeur QUE s'il a été fourni : un mot de
  // passe vide veut dire « inchangé », pas « efface-le ».
  for (const conditional of [
    'if (rename) command.push(`=name=${rename}`)',
    'if (password) command.push(`=password=${password}`)',
    'if (target) command.push(`=profile=${target.profileName}`)',
  ]) {
    assert.ok(body.includes(conditional), `attendu : ${conditional}`);
  }

  // Renommage : libre PARTOUT avant la première écriture, et remise en état si
  // une zone refuse en cours de route — un compte répondant à deux noms selon
  // la zone serait pire que l'échec.
  const check = body.indexOf("existe déjà sur");
  const write = body.indexOf('"/ip/hotspot/user/set"');
  assert.ok(check > 0 && write > check, "la vérification doit précéder l'écriture");
  assert.match(body, /renamed\.map/);
  assert.match(body, /=name=\$\{account\.username\}/);

  // Le compagnon MAC se connecte avec son propre profil RouterOS : après un
  // changement d'offre (ou de nom), il doit être re-matérialisé depuis la
  // liaison durable, sinon le téléphone garderait l'ancien débit/durée.
  assert.match(body, /syncRoamingDeviceBinding/);
});

test("modifier et supprimer ne touchent que les comptes nominatifs", async () => {
  const provision = await read("src/lib/roaming/provision.ts");
  // loadNamedAccount borne à l'organisation ET au useCase : ces deux chemins ne
  // peuvent pas servir à trafiquer un ticket vendu.
  assert.match(provision, /row\.useCase !== NAMED_USER_CASE/);
  assert.match(provision, /eq\(vouchers\.orgId, orgId\)/);
  for (const fn of ["updateRoamingAccount", "deleteRoamingAccount"]) {
    const body = provision.slice(provision.indexOf(`export async function ${fn}`));
    assert.match(body.slice(0, 900), /loadNamedAccount\(orgId, voucherId\)/, `${fn} doit passer par loadNamedAccount`);
  }
});

test("une zone ajoutée à un groupe reçoit ses comptes déjà existants", async () => {
  const [actions, provision, console] = await Promise.all([
    read("src/lib/roaming/actions.ts"),
    read("src/lib/roaming/provision.ts"),
    read("src/app/admin/roaming/RoamingConsole.tsx"),
  ]);

  assert.match(actions, /export async function addRoamingGroupRouters/);
  assert.match(actions, /extendRoamingGroup\(\{/);
  assert.match(provision, /export async function extendRoamingGroup/);
  assert.match(
    provision,
    /voucherRouters\)\.values\(/,
    "chaque compte synchronisé doit être rattaché à la nouvelle zone pour la réconciliation",
  );
  assert.match(console, /Ajouter une zone/);
  assert.match(console, /useActionState\(addRoamingGroupRouters, undefined\)/);
});

test("modifier un compte propose seulement les offres de son propre groupe", async () => {
  const [page, console] = await Promise.all([
    read("src/app/admin/roaming/page.tsx"),
    read("src/app/admin/roaming/RoamingConsole.tsx"),
  ]);

  assert.match(page, /groupId: vouchers\.roamingGroupId/);
  assert.match(console, /offers\.filter\(\(offer\) => offer\.groupId === user\.groupId/);
});

test("le résultat de modifier ou supprimer reste visible auprès du compte concerné", async () => {
  const console = await read("src/app/admin/roaming/RoamingConsole.tsx");
  const accounts = console.slice(console.indexOf("Comptes existants"));

  assert.match(accounts, /confirmingId === user\.id && <><p[\s\S]*?<Notice state=\{deleteState\} \/><\/>/);
  assert.match(accounts, /editingId === user\.id && <><form[\s\S]*?<Notice state=\{editState\} \/>[\s\S]*?<\/>/);
});

test("le navigateur n'est jamais plus strict que le serveur", async () => {
  // Le formulaire de CRÉATION portait un motif sans arobase alors que le
  // serveur l'acceptait et que celui de MODIFICATION l'autorisait : « latif@ »
  // était rejeté par le navigateur, sans que rien n'atteigne le serveur. Les
  // deux champs doivent donc tirer le motif de la MÊME constante.
  const console_ = await read("src/app/admin/roaming/RoamingConsole.tsx");
  const literals = console_.match(/pattern="[^"]*"/g) ?? [];
  assert.deepEqual(literals, [], "aucun motif écrit en dur dans le JSX");
  assert.equal(
    (console_.match(/pattern=\{ROAMING_USERNAME_PATTERN\}/g) ?? []).length,
    2,
    "création ET modification doivent partager la constante",
  );

  // Et la constante doit vraiment décrire ce que le serveur accepte.
  const browserRe = new RegExp(`^${ROAMING_USERNAME_PATTERN}$`);
  for (const value of ["latif@", "abou@", "karl-", "aroune", "tech.nord", "admin_01"]) {
    assert.equal(browserRe.test(value), true, `« ${value} » doit passer le navigateur`);
    assert.equal(isValidRoamingUsername(value), true, `« ${value} » doit passer le serveur`);
  }
  for (const value of ["a&b", "ar oune", "aroûne", "a"]) {
    assert.equal(browserRe.test(value), false, `« ${value} » doit être bloqué par le navigateur`);
    assert.equal(isValidRoamingUsername(value), false, `« ${value} » doit être bloqué par le serveur`);
  }
});

test("la création de compte a son propre groupe, indépendant de l'émission", async () => {
  // Un seul sélecteur partagé trompait : au chargement il pointait le premier
  // groupe, dont les offres n'étaient pas celles des comptes listés dessous —
  // impossible de créer un compte illimité sans deviner qu'il fallait changer
  // le groupe dans une AUTRE section.
  const console_ = await read("src/app/admin/roaming/RoamingConsole.tsx");
  assert.match(console_, /const \[userGroupId, setUserGroupId\]/);
  assert.match(console_, /userCreationOffers/);
  assert.match(
    console_,
    /name="groupId" value=\{userGroupId\}/,
    "le formulaire de création doit soumettre SON groupe",
  );
  // Et le groupe par défaut doit être ACTIF : le sélecteur ne liste que ceux-là,
  // en pointer un en pause affichait un champ vide tout en le soumettant.
  assert.match(console_, /groups\.find\(\(group\) => group\.active\)\?\.id/);
});

test("les comptes roaming exposent une resynchronisation et un changement d'appareil protégés", async () => {
  const [actions, provision, console_] = await Promise.all([
    read("src/lib/roaming/actions.ts"),
    read("src/lib/roaming/provision.ts"),
    read("src/app/admin/roaming/RoamingConsole.tsx"),
  ]);
  assert.match(actions, /export async function resyncRoamingDevice/);
  assert.match(actions, /export async function replaceRoamingDevice/);
  for (const fn of ["resyncRoamingDevice", "replaceRoamingDevice"]) {
    const start = actions.indexOf(`export async function ${fn}`);
    const body = actions.slice(start, actions.indexOf("export async function", start + 10));
    assert.match(body, /requireAdminSession/);
    assert.match(body, /refreshRoamingPages/);
  }

  // Une zone ajoutée après la première connexion reçoit immédiatement la
  // liaison déjà mémorisée, pas seulement le compte et son profil.
  assert.match(provision, /roamingDeviceBindingRouters/);
  assert.match(provision, /syncRoamingDeviceBinding/);

  // L'opérateur peut voir la couverture et déclencher ces deux actions depuis
  // la fiche du compte, sans API ou manipulation RouterOS à côté.
  assert.match(console_, /Appareil mémorisé/);
  assert.match(console_, /resyncRoamingDevice/);
  assert.match(console_, /replaceRoamingDevice/);
});

test("mettre en pause ne touche à RIEN sur les MikroTik", async () => {
  const actions = await read("src/lib/roaming/actions.ts");
  for (const fn of ["setRoamingOfferActive", "setRoamingGroupActive"]) {
    const start = actions.indexOf(`export async function ${fn}`);
    assert.ok(start > 0, `${fn} doit exister`);
    const body = actions.slice(start, actions.indexOf("export async function", start + 10));

    // La pause ferme l'ÉMISSION. Toucher aux routeurs couperait l'accès de
    // clients ayant déjà payé — ce serait une tout autre décision.
    assert.doesNotMatch(body, /\/ip\/hotspot/, `${fn} ne doit envoyer aucune commande RouterOS`);
    assert.doesNotMatch(body, /connectToRouter/, `${fn} ne doit pas se connecter aux MikroTik`);

    // Session obligatoire et portée à l'organisation.
    assert.match(body, /requireAdminSession/, `${fn} doit exiger une session`);
    assert.match(body, /session\.orgId/, `${fn} doit être borné à l'organisation`);
    // Et refuser proprement si la ligne n'appartient pas à l'org (0 mise à jour).
    assert.match(body, /updated\.length === 0/, `${fn} doit refuser une cible étrangère`);
  }
});

test("un groupe en pause laisse encore révoquer un technicien", async () => {
  // provisionRoamingAccounts refuse un groupe en pause (plus d'émission), mais
  // modifier et supprimer ne doivent PAS le vérifier : sinon mettre un groupe
  // en pause empêcherait de couper le compte d'un technicien qui part, soit
  // l'inverse du but recherché.
  const provision = await read("src/lib/roaming/provision.ts");
  const between = (from, to) =>
    provision.slice(provision.indexOf(from), to ? provision.indexOf(to) : undefined);

  assert.match(
    between("export async function provisionRoamingAccounts", "export async function updateRoamingAccount"),
    /group\.active/,
    "l'émission doit refuser un groupe en pause",
  );
  for (const fn of ["updateRoamingAccount", "deleteRoamingAccount"]) {
    const body = between(`export async function ${fn}`, fn === "updateRoamingAccount" ? "export async function deleteRoamingAccount" : "export async function extendRoamingGroup");
    assert.doesNotMatch(body, /group\.active/, `${fn} ne doit pas dépendre de l'état du groupe`);
  }
});

test("supprimer un groupe est refusé tant qu'un compte y vit encore", async () => {
  const actions = await read("src/lib/roaming/actions.ts");
  const body = actions.slice(
    actions.indexOf("export async function deleteRoamingGroup"),
    actions.indexOf("export async function setRoamingOfferActive"),
  );

  // vouchers.roaming_group_id est en ON DELETE SET NULL alors que zones et
  // offres partent en cascade : un compte dont le groupe disparaît perd le
  // rattachement qui permet de le retrouver sur les routeurs. Il resterait
  // ACTIF sur les MikroTik, sans plus aucun bouton pour le couper.
  const guard = body.indexOf("namedAccounts.length > 0");
  const del = body.indexOf("db\n    .delete(roamingGroups)") >= 0
    ? body.indexOf("db\n    .delete(roamingGroups)")
    : body.indexOf(".delete(roamingGroups)");
  assert.ok(guard > 0, "le garde-fou doit exister");
  assert.ok(del > guard, "et précéder la suppression");
  assert.match(body, /NAMED_USER_CASE/, "seuls les comptes nominatifs bloquent");
  assert.match(body, /isNull\(vouchers\.deletedAt\)/, "un compte déjà supprimé ne bloque pas");

  // Un ticket vendu ne bloque pas : il perd son lien d'historique, sans plus.
  assert.match(body, /ticketCount/, "les tickets doivent être comptés, pas bloquants");

  // Et aucune de ces suppressions ne touche aux MikroTik.
  for (const fn of ["deleteRoamingOffer", "deleteRoamingGroup"]) {
    const start = actions.indexOf(`export async function ${fn}`);
    const scope = actions.slice(start, actions.indexOf("export async function", start + 10));
    assert.doesNotMatch(scope, /connectToRouter|\/ip\/hotspot/, `${fn} ne doit rien envoyer aux routeurs`);
    assert.match(scope, /session\.orgId/, `${fn} doit être borné à l'organisation`);
  }
});

test("la station roaming expose les quatre vues de la refonte", async () => {
  const console_ = await read("src/app/admin/roaming/RoamingConsole.tsx");

  for (const label of ["Exploitation", "Groupes", "Catalogue", "Comptes"]) {
    assert.match(console_, new RegExp(`>${label}<`), `la navigation doit exposer « ${label} »`);
  }
  assert.match(console_, /const \[activeView, setActiveView\]/);
});

test("l émission est ouverte depuis un tiroir guidé", async () => {
  const console_ = await read("src/app/admin/roaming/RoamingConsole.tsx");

  assert.match(console_, /const \[drawer, setDrawer\]/);
  assert.match(console_, /Créer des accès/);
  assert.match(console_, /Vérifier avant création/);
  assert.match(console_, /action=\{ticketAction\}/);
});

test("la vue exploitation montre la couverture et les zones à vérifier", async () => {
  const console_ = await read("src/app/admin/roaming/RoamingConsole.tsx");

  assert.match(console_, /Zones en ligne/);
  assert.match(console_, /À vérifier/);
  assert.match(console_, /group\.routers\.filter\(\(router\) => router\.status === "online"\)/);
  assert.match(console_, /zones non joignables/);
});

test("la vue catalogue conserve les profils et offres administrables", async () => {
  const console_ = await read("src/app/admin/roaming/RoamingConsole.tsx");

  assert.match(console_, /Profils communs/);
  assert.match(console_, /Offres du groupe/);
  assert.match(console_, /action=\{profileAction\}/);
  assert.match(console_, /action=\{offerAction\}/);
  assert.match(console_, /action=\{offerToggleAction\}/);
  assert.match(console_, /action=\{offerDropAction\}/);
});

test("la vue comptes conserve l édition, la révocation et la lecture du mot de passe", async () => {
  const console_ = await read("src/app/admin/roaming/RoamingConsole.tsx");
  const accounts = console_.slice(console_.indexOf("Comptes existants"));

  assert.match(console_, /action=\{userAction\}/);
  assert.match(accounts, /revealRoamingUserPassword/);
  assert.match(accounts, /action=\{editAction\}/);
  assert.match(accounts, /action=\{deleteAction\}/);
});
