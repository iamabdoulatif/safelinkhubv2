import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTelegramMessage,
  buildFacebookMessage,
  escapeTelegramHtml,
  truncate,
  articleUrl,
  TELEGRAM_MAX,
} from "../src/lib/social/message.ts";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const post = {
  title: "Monétiser son hotspot",
  slug: "monetiser-hotspot",
  excerpt: "Transformer un routeur MikroTik en source de revenus.",
  category: "Mobile Money",
};

test("le message Telegram porte titre, accroche, thème et lien", () => {
  const msg = buildTelegramMessage(post, "https://safelinkhub.io");
  assert.match(msg, /<b>Monétiser son hotspot<\/b>/);
  assert.match(msg, /Transformer un routeur MikroTik/);
  assert.match(msg, /#MobileMoney/, "l'espace de la catégorie casserait le hashtag");
  // Le lien doit rester NU en fin de message : c'est lui qui déclenche
  // l'aperçu (image de couverture) côté Telegram.
  assert.ok(msg.trimEnd().endsWith("https://safelinkhub.io/blog/monetiser-hotspot"));
});

test("le HTML du titre est échappé — sinon Telegram rejette tout le message", () => {
  // Un titre contenant < ou & rend le parse_mode=HTML invalide : l'API répond
  // « can't parse entities » et RIEN n'est publié.
  assert.equal(escapeTelegramHtml('Débit <5 Mbit/s & latence'), "Débit &lt;5 Mbit/s &amp; latence");
  const msg = buildTelegramMessage({ ...post, title: "Wi-Fi <public> & sécurité" }, "https://x.io");
  assert.doesNotMatch(msg.replace(/<\/?b>/g, ""), /[<>]/);
});

test("un article très long se replie sans jamais perdre son lien", () => {
  const long = { ...post, excerpt: "x".repeat(TELEGRAM_MAX + 500) };
  const msg = buildTelegramMessage(long, "https://safelinkhub.io");
  assert.ok(msg.length <= TELEGRAM_MAX, `message de ${msg.length} caractères`);
  assert.match(msg, /https:\/\/safelinkhub\.io\/blog\/monetiser-hotspot/, "le lien survit à la coupe");
});

test("la troncature coupe entre les mots, pas au milieu", () => {
  const out = truncate("le portail captif augmente vos conversions", 20);
  assert.ok(out.length <= 20, out);
  assert.ok(out.endsWith("…"));
  assert.doesNotMatch(out, /\s…$/, "pas d'espace orpheline avant les points de suspension");
  assert.equal(truncate("court", 20), "court", "une chaîne qui tient n'est pas touchée");
});

test("le message Facebook ne répète pas l'URL — la carte d'aperçu s'en charge", () => {
  const msg = buildFacebookMessage(post);
  assert.match(msg, /Monétiser son hotspot/);
  assert.doesNotMatch(msg, /https?:\/\//, "le lien passe par le paramètre `link`, pas par le corps");
});

test("l'URL de l'article tolère une origine avec barre finale", () => {
  assert.equal(articleUrl("https://safelinkhub.io/", "abc"), "https://safelinkhub.io/blog/abc");
});

test("une diffusion déjà partie n'est jamais rejouée sans geste explicite", async () => {
  const src = await read("src/lib/social/share.ts");
  // Garde applicative…
  assert.match(src, /if \(!opts\.force\)/);
  assert.match(src, /already\?\.status === "sent"/);
  // …ET garde en base : le code seul ne suffit pas si deux enregistrements
  // partent en parallèle.
  const schema = await read("src/lib/db/schema.ts");
  assert.match(schema, /blog_post_shares_post_channel_uniq/);
  const sql = await read("scripts/add-blog-social-sharing.sql");
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS blog_post_shares_post_channel_uniq/);
});

test("un brouillon n'est jamais diffusé", async () => {
  const src = await read("src/lib/social/share.ts");
  // Le lien mènerait à une 404 : la garde doit précéder tout envoi.
  const guard = src.indexOf("if (!post || !post.published) return []");
  const send = src.indexOf("sendToTelegram(");
  assert.ok(guard > 0 && send > guard, "la garde publiée doit précéder l'envoi");
});

test("les jetons sont chiffrés au repos et ne descendent jamais au navigateur", async () => {
  const actions = await read("src/lib/social/actions.ts");
  assert.match(actions, /encryptSecret\(telegramBotToken\)/);
  assert.match(actions, /encryptSecret\(facebookPageToken\)/);

  // Le formulaire de réglages ne reçoit qu'un booléen de présence.
  const share = await read("src/lib/social/share.ts");
  const form = share.slice(
    share.indexOf("export async function readShareSettingsForForm"),
    share.indexOf("export async function configuredChannels"),
  );
  assert.match(form, /hasTelegramToken: Boolean\(row\.telegramBotToken\)/);
  assert.doesNotMatch(form, /decryptSecret/, "aucun déchiffrement du côté du formulaire");

  // getMarketingSettings descend jusqu'à un composant CLIENT (AnalyticsScripts) :
  // aucun champ de jeton ne doit y figurer.
  const queries = await read("src/lib/marketing/queries.ts");
  for (const secret of ["telegramBotToken", "facebookPageToken"]) {
    assert.doesNotMatch(queries, new RegExp(secret), `${secret} ne doit pas transiter par les réglages publics`);
  }
});

test("la diffusion ne bloque pas l'enregistrement et ne part qu'au passage en publié", async () => {
  const actions = await read("src/lib/blog/actions.ts");
  assert.match(actions, /import \{ after \} from "next\/server"/);
  assert.match(actions, /after\(async \(\) => \{/);
  // Réenregistrer un article DÉJÀ publié ne doit rien renvoyer sur les réseaux.
  assert.match(actions, /if \(published && !existing\.published\) shareAfterResponse/);
  // Un réseau injoignable ne doit pas remonter en erreur d'enregistrement.
  assert.match(actions, /catch \(err\) \{[\s\S]*?console\.error\("\[blog\] diffusion/);
});

test("WhatsApp n'est pas proposé, et la raison est écrite", async () => {
  // L'API Groupes de Meta plafonne un groupe à 8 participants : la fonction
  // demandée n'est pas réalisable, et un futur lecteur doit savoir pourquoi
  // plutôt que de croire à un oubli.
  const channels = await read("src/lib/social/channels.ts");
  assert.match(channels, /SHARE_CHANNELS = \["telegram", "facebook"\]/);
  assert.doesNotMatch(channels, /whatsapp/i.source ? /"whatsapp"/ : /$^/);
  assert.match(channels, /plafonne un groupe à 8 participants/);
  const schema = await read("src/lib/db/schema.ts");
  assert.match(schema, /plafonne un groupe à 8/);
});

test("aucun composant client ne tire la base dans le bundle navigateur", async () => {
  // Vécu pendant l'intégration : BlogPostForm ("use client") importait un
  // simple libellé depuis share.ts, qui importe getDb → pg. Tout le pilote
  // Postgres partait dans le bundle et le build cassait sur « Can't resolve
  // 'dns' ». Le message d'erreur ne désigne jamais le composant fautif.
  const { readdir } = await import("node:fs/promises");
  const { join, dirname, resolve } = await import("node:path");

  const root = new URL("../", import.meta.url).pathname;
  async function walk(dir) {
    const out = [];
    for (const e of await readdir(join(root, dir), { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const rel = join(dir, e.name);
      if (e.isDirectory()) out.push(...(await walk(rel)));
      else if (/\.tsx?$/.test(e.name)) out.push(rel);
    }
    return out;
  }

  const files = await walk("src");
  const touchesDb = new Map();
  for (const f of files) {
    const src = await read(f);
    touchesDb.set(f, /from "pg"|from "@\/lib\/db"/.test(src));
  }

  const resolveAlias = (spec, from) => {
    const base = spec.startsWith("@/")
      ? join("src", spec.slice(2))
      : resolve("/" + dirname(from), spec).slice(1);
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      if (touchesDb.has(base + ext)) return base + ext;
    }
    return null;
  };

  const fautifs = [];
  for (const f of files) {
    const src = await read(f);
    if (!/^["']use client["']/m.test(src)) continue;
    // On lit l'INSTRUCTION entière, pas seulement la clause `from` : un
    // `import type { X } from "…"` est effacé à la compilation et ne met rien
    // dans le bundle. Le signaler serait un faux positif.
    for (const m of src.matchAll(/import\s+(type\s+)?[^;]*?from ["'](@\/[^"']+|\.[^"']+)["']/g)) {
      if (m[1]) continue;
      // Une Server Action est une frontière : l'importer depuis un client est
      // le fonctionnement normal, le module ne part pas dans le bundle.
      const target = resolveAlias(m[2], f);
      if (!target) continue;
      const targetSrc = await read(target);
      if (/^["']use server["']/m.test(targetSrc)) continue;
      if (touchesDb.get(target)) fautifs.push(`${f} → ${target}`);
    }
  }
  assert.deepEqual(fautifs, [], "un composant client importe un module qui touche la base");
});
