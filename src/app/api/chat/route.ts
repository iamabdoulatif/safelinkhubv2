/**
 * L'assistant du site — point d'entrée public.
 *
 * Endpoint OUVERT (le visiteur n'est pas connecté) qui déclenche un appel
 * payant : tout ce qui arrive ici est donc borné avant d'atteindre Mistral —
 * nombre de messages, taille de chaque message, cadence par IP. Le cadrage
 * (ce que l'assistant a le droit de dire) est ajouté ICI, côté serveur : posé
 * côté navigateur, n'importe qui le remplacerait par le sien.
 */

import { NextResponse } from "next/server";
import { enforcePublicSubmissionRateLimit } from "@/lib/public-rate-limit";
import { buildAssistantSystemPrompt } from "@/lib/ai/assistant-prompt";
import { parseChatRequest } from "@/lib/ai/chat-request";
import { MistralError, streamMistralChat } from "@/lib/ai/mistral";
import { getDictionary } from "@/lib/i18n/dictionaries";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }

  const verdict = parseChatRequest(body);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Conversation invalide ou trop longue.", reason: verdict.reason },
      { status: 400 },
    );
  }
  const { messages, locale } = verdict;

  const limit = await enforcePublicSubmissionRateLimit("chat");
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error:
          locale === "en"
            ? "Too many messages. Please try again later or use the contact page."
            : "Trop de messages. Réessayez plus tard ou passez par la page contact.",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // La FAQ publiée EST la base de connaissances : l'assistant et la page
  // disent alors la même chose, et corriger l'une corrige l'autre.
  const dict = await getDictionary(locale);
  const system = buildAssistantSystemPrompt({ locale, faqs: dict.content.faqs });

  try {
    const stream = await streamMistralChat({
      messages: [{ role: "system", content: system }, ...messages],
      signal: request.signal,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        // Le relais nginx met en tampon par défaut : la réponse arriverait
        // d'un bloc à la fin, et le flux ne servirait à rien.
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const status = error instanceof MistralError ? error.status : 500;
    if (!(error instanceof MistralError)) console.error("[chat]", error);
    return NextResponse.json(
      {
        error:
          locale === "en"
            ? "The assistant is unavailable right now."
            : "L'assistant est indisponible pour le moment.",
      },
      { status },
    );
  }
}
