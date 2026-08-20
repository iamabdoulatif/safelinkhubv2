// Orchestration de la diffusion d'un article vers les réseaux.
// Module « plain » : rien ici ne doit devenir un endpoint HTTP.

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { blogPosts, blogPostShares, marketingSettings } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/mikrotik/crypto";
import { getAppUrl } from "@/lib/net/app-url";
import { buildFacebookMessage, buildTelegramMessage, articleUrl } from "./message";
import { postToFacebookPage, sendToTelegram, type ShareOutcome } from "./providers";
import { SHARE_CHANNELS, type ShareChannel } from "./channels";

export { SHARE_CHANNELS, CHANNEL_LABEL, type ShareChannel } from "./channels";

export type ShareRow = {
  channel: string;
  status: string;
  externalUrl: string | null;
  error: string | null;
  createdAt: Date;
};

/**
 * Lecture des identifiants de diffusion. SÉPARÉE À DESSEIN de
 * `getMarketingSettings()`.
 *
 * Cette dernière est mise en cache et son résultat descend jusqu'à
 * `AnalyticsScripts`, un composant CLIENT : tout champ qu'on y ajouterait
 * partirait dans le HTML envoyé au navigateur. Un jeton de bot Telegram ou de
 * page Facebook n'a rien à y faire. Cette fonction reste donc côté serveur,
 * non cachée, et déchiffre à la volée.
 */
export async function readShareCredentials(): Promise<{
  telegram: { botToken: string; chatId: string } | null;
  facebook: { pageId: string; pageToken: string } | null;
}> {
  if (!process.env.DATABASE_URL) return { telegram: null, facebook: null };
  const db = getDb();
  // Le SCHÉMA PEUT ÊTRE EN RETARD sur le code : si l'image est déployée avant
  // que scripts/add-blog-social-sharing.sql soit passé, ces colonnes n'existent
  // pas encore. Le même piège a déjà cassé le prérendu des pages publiques
  // pendant quatre jours (voir src/lib/marketing/queries.ts) — ici l'éditeur
  // d'article se contente d'afficher « aucun canal configuré ».
  const [row] = await db
    .select({
      telegramBotToken: marketingSettings.telegramBotToken,
      telegramChatId: marketingSettings.telegramChatId,
      facebookPageId: marketingSettings.facebookPageId,
      facebookPageToken: marketingSettings.facebookPageToken,
    })
    .from(marketingSettings)
    .limit(1)
    .catch(() => []);
  if (!row) return { telegram: null, facebook: null };

  // Un jeton illisible (AUTH_SECRET tourné, valeur corrompue) ne doit pas
  // faire tomber la publication : le canal est simplement considéré comme non
  // configuré, et l'exploitant le reconstate dans les réglages.
  const open = (value: string | null) => {
    if (!value) return null;
    try {
      return decryptSecret(value);
    } catch {
      return null;
    }
  };

  const botToken = open(row.telegramBotToken);
  const pageToken = open(row.facebookPageToken);
  return {
    telegram: botToken && row.telegramChatId ? { botToken, chatId: row.telegramChatId } : null,
    facebook: pageToken && row.facebookPageId ? { pageId: row.facebookPageId, pageToken } : null,
  };
}

/**
 * Ce que le formulaire de réglages a le droit de connaître.
 *
 * Renvoie la PRÉSENCE d'un jeton (`hasTelegramToken`), jamais sa valeur : ce
 * résultat traverse la frontière serveur → client, et un jeton s'y retrouverait
 * en clair dans le HTML de la page d'administration.
 */
export async function readShareSettingsForForm(): Promise<{
  telegramChatId: string | null;
  facebookPageId: string | null;
  hasTelegramToken: boolean;
  hasFacebookToken: boolean;
}> {
  const empty = {
    telegramChatId: null,
    facebookPageId: null,
    hasTelegramToken: false,
    hasFacebookToken: false,
  };
  if (!process.env.DATABASE_URL) return empty;
  const db = getDb();
  const [row] = await db
    .select({
      telegramChatId: marketingSettings.telegramChatId,
      facebookPageId: marketingSettings.facebookPageId,
      telegramBotToken: marketingSettings.telegramBotToken,
      facebookPageToken: marketingSettings.facebookPageToken,
    })
    .from(marketingSettings)
    .limit(1)
    .catch(() => []);
  if (!row) return empty;
  return {
    telegramChatId: row.telegramChatId,
    facebookPageId: row.facebookPageId,
    hasTelegramToken: Boolean(row.telegramBotToken),
    hasFacebookToken: Boolean(row.facebookPageToken),
  };
}

/** Quels canaux sont utilisables aujourd'hui ? Sert à griser les cases de l'éditeur. */
export async function configuredChannels(): Promise<ShareChannel[]> {
  const creds = await readShareCredentials();
  return SHARE_CHANNELS.filter((c) => creds[c] !== null);
}

export async function listPostShares(postId: string): Promise<ShareRow[]> {
  if (!process.env.DATABASE_URL) return [];
  const db = getDb();
  return db
    .select({
      channel: blogPostShares.channel,
      status: blogPostShares.status,
      externalUrl: blogPostShares.externalUrl,
      error: blogPostShares.error,
      createdAt: blogPostShares.createdAt,
    })
    .from(blogPostShares)
    .where(eq(blogPostShares.postId, postId))
    .catch(() => [] as ShareRow[]);
}

async function record(postId: string, channel: ShareChannel, outcome: ShareOutcome) {
  const db = getDb();
  const values = {
    postId,
    channel,
    status: outcome.ok ? "sent" : "failed",
    externalUrl: outcome.ok ? outcome.url : null,
    error: outcome.ok ? null : outcome.error,
    updatedAt: new Date(),
  };
  // Un échec doit pouvoir être rejoué : on écrase la ligne précédente du même
  // canal plutôt que d'empiler des tentatives.
  await db
    .insert(blogPostShares)
    .values(values)
    .onConflictDoUpdate({
      target: [blogPostShares.postId, blogPostShares.channel],
      set: values,
    });
}

export type ShareReport = { channel: ShareChannel; ok: boolean; error?: string }[];

/**
 * Diffuse un article sur les canaux demandés.
 *
 * IDEMPOTENT : un canal déjà marqué « sent » est ignoré, sauf `force` (bouton
 * « Relancer » de l'éditeur). Sans cela, un simple enregistrement d'article
 * déjà publié reposterait le message à chaque sauvegarde.
 */
export async function shareBlogPost(
  postId: string,
  opts: { channels?: ShareChannel[]; force?: boolean } = {},
): Promise<ShareReport> {
  if (!process.env.DATABASE_URL) return [];
  const db = getDb();

  const [post] = await db
    .select({
      title: blogPosts.title,
      slug: blogPosts.slug,
      excerpt: blogPosts.excerpt,
      category: blogPosts.category,
      published: blogPosts.published,
    })
    .from(blogPosts)
    .where(eq(blogPosts.id, postId))
    .limit(1);
  // On ne diffuse jamais un brouillon : le lien mènerait à une 404.
  if (!post || !post.published) return [];

  const creds = await readShareCredentials();
  const wanted = opts.channels ?? [...SHARE_CHANNELS];
  const report: ShareReport = [];

  for (const channel of wanted) {
    const cred = creds[channel];
    if (!cred) continue;

    if (!opts.force) {
      const [already] = await db
        .select({ status: blogPostShares.status })
        .from(blogPostShares)
        .where(and(eq(blogPostShares.postId, postId), eq(blogPostShares.channel, channel)))
        .limit(1);
      if (already?.status === "sent") continue;
    }

    const appUrl = getAppUrl();
    const outcome =
      channel === "telegram"
        ? await sendToTelegram({
            botToken: (cred as { botToken: string; chatId: string }).botToken,
            chatId: (cred as { botToken: string; chatId: string }).chatId,
            html: buildTelegramMessage(post, appUrl),
          })
        : await postToFacebookPage({
            pageId: (cred as { pageId: string; pageToken: string }).pageId,
            pageToken: (cred as { pageId: string; pageToken: string }).pageToken,
            message: buildFacebookMessage(post),
            link: articleUrl(appUrl, post.slug),
          });

    await record(postId, channel, outcome);
    report.push(outcome.ok ? { channel, ok: true } : { channel, ok: false, error: outcome.error });
  }

  return report;
}
