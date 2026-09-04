/**
 * Appel direct de l'API Mistral — sans SDK.
 *
 * Une seule requête POST suffit (l'endpoint est compatible OpenAI) : ajouter
 * un client officiel ferait entrer un paquet, sa chaîne de dépendances et son
 * cycle de mises à jour dans l'image, pour envelopper trente lignes de fetch.
 * Voir https://docs.mistral.ai/api/ — POST /v1/chat/completions, flux SSE
 * terminé par « data: [DONE] ».
 */

const ENDPOINT = "https://api.mistral.ai/v1/chat/completions";
/** Petit modèle par défaut : l'assistant guide, il ne raisonne pas. */
const DEFAULT_MODEL = "mistral-small-latest";

export type ChatRole = "system" | "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };

/** La clé n'existe que côté serveur : sans elle, l'assistant ne s'affiche pas. */
export function isMistralConfigured(): boolean {
  return Boolean(process.env.MISTRAL_API_KEY);
}

export class MistralError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MistralError";
  }
}

/**
 * Diffuse la réponse en texte brut, morceau par morceau.
 *
 * On renvoie du TEXTE et non les événements bruts : le navigateur n'a alors
 * rien à décoder, et la forme des chunks de Mistral ne fuit pas jusqu'au
 * composant — elle reste un détail de ce fichier.
 */
export async function streamMistralChat({
  messages,
  signal,
  maxTokens = 600,
}: {
  messages: ChatMessage[];
  signal?: AbortSignal;
  maxTokens?: number;
}): Promise<ReadableStream<Uint8Array>> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new MistralError("MISTRAL_API_KEY manquante.", 503);

  const response = await fetch(ENDPOINT, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.MISTRAL_MODEL || DEFAULT_MODEL,
      messages,
      // Basse mais non nulle : on veut des réponses stables sur les faits du
      // produit, pas une formulation figée mot pour mot.
      temperature: 0.3,
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    // Le corps d'erreur de Mistral peut contenir la requête complète : il est
    // journalisé côté serveur, jamais renvoyé au visiteur.
    const detail = await response.text().catch(() => "");
    console.error("[mistral] %d %s", response.status, detail.slice(0, 500));
    throw new MistralError("Le service de conversation est indisponible.", 502);
  }

  return decodeSseToText(response.body);
}

/** Transforme le flux SSE de Mistral en flux de texte. */
function decodeSseToText(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        // Un événement se termine par une ligne vide ; un chunk réseau peut
        // couper au milieu d'un JSON, d'où le tampon conservé entre passages.
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          for (const line of event.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload);
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta) controller.enqueue(encoder.encode(delta));
            } catch {
              /* Événement tronqué ou champ inconnu : on l'ignore plutôt que
                 d'interrompre une réponse déjà commencée. */
            }
          }
        }
      },
    }),
  );
}
