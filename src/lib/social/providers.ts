// Appels sortants vers Telegram et Facebook. Une fonction par réseau, chacune
// renvoyant le MÊME résultat normalisé — l'orchestration n'a pas à connaître la
// forme des erreurs de chaque API.
//
// Aucune exception n'est laissée remonter : une diffusion ratée ne doit jamais
// empêcher la publication de l'article, qui est l'acte important.

export type ShareOutcome =
  | { ok: true; url: string | null }
  | { ok: false; error: string };

/** Toute API distante peut ne jamais répondre — sans borne, l'action reste
 * ouverte jusqu'au timeout de la plateforme. */
const TIMEOUT_MS = 12_000;

function short(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 400);
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.text();
    try {
      const json = JSON.parse(body);
      // Telegram : { description }. Facebook : { error: { message } }.
      return short(json?.error?.message ?? json?.description ?? body);
    } catch {
      return short(body || `HTTP ${res.status}`);
    }
  } catch {
    return `HTTP ${res.status}`;
  }
}

/**
 * Publie dans un salon Telegram via la Bot API.
 *
 * `chatId` accepte l'identifiant numérique (`-1001234567890`) comme le nom
 * public (`@mon_canal`). Le bot doit être ADMINISTRATEUR du groupe ou du canal
 * pour y écrire — c'est la cause d'échec la plus fréquente, et l'API la
 * renvoie explicitement ("not enough rights").
 */
export async function sendToTelegram(params: {
  botToken: string;
  chatId: string;
  html: string;
  timeoutMs?: number;
}): Promise<ShareOutcome> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${params.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: params.chatId,
        text: params.html,
        parse_mode: "HTML",
        // L'aperçu de lien EST l'intérêt du message : on ne le désactive pas.
        disable_web_page_preview: false,
      }),
      signal: AbortSignal.timeout(params.timeoutMs ?? TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, error: await readError(res) };
    const json = (await res.json()) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number; chat?: { username?: string } };
    };
    if (!json.ok) return { ok: false, error: short(json.description ?? "réponse Telegram invalide") };
    const username = json.result?.chat?.username;
    const messageId = json.result?.message_id;
    return {
      ok: true,
      url: username && messageId ? `https://t.me/${username}/${messageId}` : null,
    };
  } catch (err) {
    return { ok: false, error: short(err instanceof Error ? err.message : String(err)) };
  }
}

/**
 * Publie sur le fil d'une page Facebook (Graph API `/{page-id}/feed`).
 *
 * Le jeton doit être un PAGE access token de longue durée portant
 * `pages_manage_posts` — un jeton utilisateur est refusé. Les jetons de page
 * expirent : l'erreur remontée par Meta est conservée telle quelle pour que
 * l'exploitant voie « Session has expired » plutôt qu'un « échec » muet.
 */
export async function postToFacebookPage(params: {
  pageId: string;
  pageToken: string;
  message: string;
  link: string;
  timeoutMs?: number;
}): Promise<ShareOutcome> {
  try {
    const body = new URLSearchParams({
      message: params.message,
      link: params.link,
      access_token: params.pageToken,
    });
    const res = await fetch(`https://graph.facebook.com/v21.0/${params.pageId}/feed`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(params.timeoutMs ?? TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, error: await readError(res) };
    const json = (await res.json()) as { id?: string };
    return {
      ok: true,
      url: json.id ? `https://www.facebook.com/${json.id}` : null,
    };
  } catch (err) {
    return { ok: false, error: short(err instanceof Error ? err.message : String(err)) };
  }
}
