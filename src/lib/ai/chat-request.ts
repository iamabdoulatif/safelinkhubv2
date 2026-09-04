/**
 * Ce qu'on accepte de faire payer.
 *
 * L'endpoint de l'assistant est PUBLIC et chaque appel coûte : la validation
 * n'est donc pas une politesse d'API, c'est la porte. Elle vit à part de la
 * route parce qu'un fichier de route Next n'expose que ses méthodes HTTP —
 * ici, elle se relit et s'éprouve seule.
 */

import type { ChatMessage } from "./mistral";

/** Un échange plus long qu'un tour de parole raisonnable est refusé. */
export const MAX_MESSAGES = 16;
export const MAX_CHARS = 1200;

export type ChatRequestVerdict =
  | { ok: true; messages: ChatMessage[]; locale: "fr" | "en" }
  | { ok: false; reason: "shape" | "empty" | "too_many" | "too_long" | "not_a_question" };

export function parseChatRequest(body: unknown): ChatRequestVerdict {
  const payload = body as { messages?: unknown; locale?: unknown } | null;
  const raw = payload?.messages;
  if (!Array.isArray(raw)) return { ok: false, reason: "shape" };
  if (raw.length === 0) return { ok: false, reason: "empty" };
  if (raw.length > MAX_MESSAGES) return { ok: false, reason: "too_many" };

  const messages: ChatMessage[] = [];
  for (const item of raw) {
    const role = (item as { role?: unknown })?.role;
    const content = (item as { content?: unknown })?.content;
    // Le rôle « system » est refusé À DESSEIN : c'est le cadrage, et il est
    // posé par le serveur. Accepté du client, n'importe qui remplacerait les
    // règles de l'assistant par les siennes.
    if (role !== "user" && role !== "assistant") return { ok: false, reason: "shape" };
    if (typeof content !== "string") return { ok: false, reason: "shape" };
    const trimmed = content.trim();
    if (!trimmed) return { ok: false, reason: "empty" };
    if (trimmed.length > MAX_CHARS) return { ok: false, reason: "too_long" };
    messages.push({ role, content: trimmed });
  }

  // Le dernier tour doit être une question : sinon un client pourrait faire
  // régénérer la même réponse en boucle, à nos frais.
  if (messages[messages.length - 1].role !== "user") {
    return { ok: false, reason: "not_a_question" };
  }

  return { ok: true, messages, locale: payload?.locale === "en" ? "en" : "fr" };
}
