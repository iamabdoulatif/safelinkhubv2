import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const ROOT = new URL("../src/", import.meta.url).pathname;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir)) {
    const p = join(dir, entry);
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p)));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const GUARD = /getSession\s*\(|requireAdminSession\s*\(|isSuperAdmin\s*\(|getMfaPendingToken\s*\(/;

/**
 * Toute fonction exportée d'un module `"use server"` est enregistrée par
 * Next.js comme un ENDPOINT HTTP appelable. Une action sans vérification de
 * session est donc une route publique — c'est ainsi que sept helpers internes
 * (confirmations de dépôt, soldes, synchronisation MNDP) se sont retrouvés
 * exposés, dont deux qui créditaient de l'argent.
 *
 * Cette liste est la SEULE dérogation admise. Y ajouter une entrée doit être un
 * geste conscient : ce sont les points d'entrée d'authentification (pas encore
 * de session, par définition) et des accesseurs de configuration strictement
 * publique (tarifs affichés, numéro WhatsApp, drapeau de fonctionnalité).
 */
const PUBLIC_BY_DESIGN = new Set([
  "login",
  "register",
  "activateAccount",
  "resendActivation",
  "requestPasswordReset",
  "resetPassword",
  "logout",
  "getAutoSetupGateConfigPublic",
  "getManualAuthWhatsappNumber",
  "getRemoteAccessContactPublic",
  "getRemoteAccessPaymentConfigPublic",
]);

async function collectUnguardedActions() {
  const unguarded = [];
  let total = 0;
  for (const file of await walk(ROOT)) {
    const src = await readFile(file, "utf8");
    if (!src.startsWith('"use server"')) continue;
    const lines = src.split("\n");

    // Un helper local qui fait lui-même la vérification compte comme garde
    // (ex. requireSuperadmin, loadOwnedRouter).
    const helpers = new Set();
    const fns = [];
    lines.forEach((l, i) => {
      const m =
        l.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/) ||
        l.match(/^const\s+(\w+)\s*=\s*(?:async\s*)?\(/);
      if (m) fns.push([i, m[1]]);
    });
    fns.forEach(([i, name], k) => {
      const end = k + 1 < fns.length ? fns[k + 1][0] : lines.length;
      if (GUARD.test(lines.slice(i, end).join("\n"))) helpers.add(name);
    });
    const helperRe = helpers.size ? new RegExp(`\\b(${[...helpers].join("|")})\\s*\\(`) : null;

    const starts = [];
    lines.forEach((l, i) => {
      const m = l.match(/^export\s+async\s+function\s+(\w+)/);
      if (m) starts.push([i, m[1]]);
    });
    starts.forEach(([i, name], k) => {
      const end = k + 1 < starts.length ? starts[k + 1][0] : lines.length;
      const body = lines.slice(i, end).join("\n");
      total++;
      if (!GUARD.test(body) && !(helperRe && helperRe.test(body))) {
        unguarded.push({ name, file: file.replace(ROOT, "src/"), line: i + 1 });
      }
    });
  }
  return { unguarded, total };
}

test("aucune server action n'est exposée sans garde de session", async () => {
  const { unguarded, total } = await collectUnguardedActions();

  assert.ok(total > 150, `attendu >150 actions analysées, vu ${total}`);

  const unexpected = unguarded.filter((a) => !PUBLIC_BY_DESIGN.has(a.name));
  assert.deepEqual(
    unexpected.map((a) => `${a.file}:${a.line} ${a.name}`),
    [],
    "Nouvelle action exportée sans vérification de session. Si elle n'est appelée " +
      "que par du code serveur (cron, webhook), déplacez-la dans un module SANS " +
      '"use server". Si un composant client en a besoin, ajoutez getSession() et ' +
      "dérivez l'organisation de la session au lieu de la recevoir en paramètre.",
  );
});

test("les helpers internes ne sont plus des endpoints", async () => {
  // Les sept fuites corrigées : leur seul appelant est du code serveur.
  const cases = [
    ["src/lib/wallet/balance.ts", "getWalletBalanceCents"],
    ["src/lib/wallet/topup-confirmation.ts", "completeWalletTopupByReference"],
    ["src/lib/safecoin/topup-confirmation.ts", "completeSafecoinTopupByReference"],
    ["src/lib/mikrotik/mndp-sync.ts", "syncMndpAnnouncementsForOrg"],
    ["src/lib/mikrotik/mndp-sync.ts", "syncMndpAnnouncementsForAllOrgs"],
  ];
  for (const [path, fn] of cases) {
    const src = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /^"use server"/, `${path} doit rester un module « plain »`);
    assert.match(src, new RegExp(`export async function ${fn}`), `${path} doit exporter ${fn}`);
  }
});

test("la synchronisation MNDP ne reçoit plus l'organisation du client", async () => {
  const relay = await readFile(new URL("../src/lib/mikrotik/mndp-relay.ts", import.meta.url), "utf8");

  // L'action exposée ne prend AUCUN paramètre et dérive l'org de la session.
  assert.match(relay, /export async function syncMndpAnnouncements\(\)/);
  assert.match(relay, /syncMndpAnnouncementsForOrg\(session\.orgId\)/);
  // Et le balayage de tout le parc n'est plus exporté depuis ce module.
  assert.doesNotMatch(relay, /export async function syncMndpAnnouncementsForAllOrgs/);
});
