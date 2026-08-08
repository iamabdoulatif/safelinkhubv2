import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

const ACTIONS = "src/lib/vouchers/actions.ts";
const MODAL = "src/app/admin/vouchers/DeleteTicketsModal.tsx";
const TABLE = "src/app/admin/vouchers/VoucherTable.tsx";

test("seuls les tickets DÉJÀ dans la corbeille peuvent être supprimés", async () => {
  const source = await read(ACTIONS);
  const body = source.slice(source.indexOf("async function deleteTrashedVouchers"));

  // Un ticket actif ne se détruit pas d'un geste : il faut l'archiver d'abord,
  // ce qui laisse une étape pour se raviser.
  assert.match(body, /isNotNull\(vouchers\.deletedAt\)/);
  assert.match(body, /eq\(vouchers\.orgId, orgId\)/);
});

test("la portée « plateforme » ne touche JAMAIS le routeur", async () => {
  const source = await read(ACTIONS);
  const body = source.slice(source.indexOf("async function deleteTrashedVouchers"));
  const platformBranch = body.slice(
    body.indexOf('if (scope === "platform")'),
    body.indexOf("// Portée matériel"),
  );

  assert.ok(platformBranch.length > 0, "la branche plateforme doit exister");
  // C'est l'engagement pris à l'utilisateur dans le dialogue : aucune connexion
  // au matériel, aucune commande de suppression hotspot sur ce chemin.
  assert.doesNotMatch(platformBranch, /connectToRouter/);
  assert.doesNotMatch(platformBranch, /hotspot\/user\/remove/);
});

test("un routeur injoignable EMPÊCHE la suppression côté plateforme", async () => {
  const source = await read(ACTIONS);
  const body = source.slice(source.indexOf("async function deleteTrashedVouchers"));

  // Supprimer quand même laisserait un compte hotspot actif sur le matériel
  // sans plus aucune trace ici : un accès Wi-Fi introuvable.
  assert.match(body, /catch \{[\s\S]{0,160}unreachableRouters\.push\(router\.name\)/);
  assert.match(body, /voucherIds\.forEach\(\(id\) => blocked\.add\(id\)\)/);
  // Et la suppression finale exclut explicitement les bloqués.
  assert.match(body, /batchIds\.filter\(\(id\) => !blocked\.has\(id\)\)/);
});

test("la suppression côté routeur est bornée pour tenir sous la coupure Cloudflare", async () => {
  const source = await read(ACTIONS);

  // RouterOS n'a pas de suppression en lot : un aller-retour par ticket. Vider
  // 2 000 tickets sur le matériel ne peut pas tenir dans une seule requête.
  assert.match(source, /const MAX_ROUTER_DELETE_PER_RUN = \d+/);
  assert.match(source, /slice\(0, MAX_ROUTER_DELETE_PER_RUN\)/);
  // Le reste est annoncé, jamais tronqué en silence.
  assert.match(source, /remaining = trashed\.length - batch\.length/);
});

test("le dialogue demande la portée et n'en présélectionne aucune vers le matériel", async () => {
  const modal = await read(MODAL);

  assert.match(modal, /Sur la plateforme seulement/);
  assert.match(modal, /Sur la plateforme ET sur le MikroTik/);
  // Le défaut est le choix INOFFENSIF. La suppression sur le matériel ne peut
  // pas être un effet de bord d'un clic rapide.
  assert.match(modal, /useState<VoucherDeleteScope>\("platform"\)/);
  assert.match(modal, /if \(open\) setScope\("platform"\)/);
  // Et le danger est nommé, pas sous-entendu.
  assert.match(modal, /restent sur le MikroTik/);
  assert.match(modal, /perdent l&apos;accès immédiatement/);
});

test("aucune suppression n'est déclenchée sans passer par le dialogue", async () => {
  const table = await read(TABLE);

  // Les boutons ouvrent le dialogue ; ils n'appellent jamais l'action.
  assert.match(table, /setDeleteAsk\(\{ mode: "selection"/);
  assert.match(table, /setDeleteAsk\(\{ mode: "empty"/);
  assert.doesNotMatch(table, /onClick=\{\(\) => deleteVouchers\(/);
  assert.doesNotMatch(table, /onClick=\{\(\) => emptyVoucherTrash\(/);
  // La portée vient du dialogue, pas d'une valeur figée à l'appel.
  assert.match(table, /function confirmDelete\(scope: VoucherDeleteScope\)/);
  // Les tickets conservés faute de routeur sont signalés comme un problème.
  assert.match(table, /keptForUnreachableRouter > 0 \? "error" : "success"/);
});
