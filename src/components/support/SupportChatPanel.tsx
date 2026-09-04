"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Send, X } from "lucide-react";
import { tokenizeAssistantText } from "@/lib/ai/assistant-links";
import { UI, type AssistantUiLocale } from "./support-chat-ui";

/**
 * Le panneau de conversation — chargé À LA DEMANDE.
 *
 * Il est séparé du bouton parce que le composant est monté par le layout
 * RACINE : son code partirait sinon vers le portail captif, servi derrière le
 * walled-garden à des téléphones qui n'ont pas encore payé leur connexion.
 * Tant que personne n'ouvre l'assistant, rien de tout ceci n'est téléchargé.
 */
type Message = { role: "user" | "assistant"; content: string };

/** Le texte du modèle, rendu en ÉLÉMENTS — jamais en HTML injecté. */
function AssistantText({ text }: { text: string }) {
  return (
    <>
      {tokenizeAssistantText(text).map((token, i) =>
        token.kind === "link" ? (
          <Link
            key={i}
            href={token.href}
            className="font-medium text-brand-deep underline underline-offset-2"
          >
            {token.value}
          </Link>
        ) : (
          <span key={i}>{token.value}</span>
        ),
      )}
    </>
  );
}

export default function SupportChatPanel({
  open,
  locale,
  onClose,
}: {
  open: boolean;
  locale: AssistantUiLocale;
  onClose: () => void;
}) {
  const t = UI[locale];

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, streaming]);

  // Une réponse en cours n'a plus de destinataire si le composant disparaît.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || streaming) return;

    const historique = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(historique);
    setDraft("");
    setError(null);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        /* Seuls les DERNIERS tours partent : la conversation entière
           grossirait la facture à chaque message, et l'assistant n'a pas
           besoin de plus pour guider. */
        body: JSON.stringify({ messages: historique.slice(-8), locale }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? t.error);
      }

      setMessages([...historique, { role: "assistant", content: "" }]);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const morceau = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") next[next.length - 1] = { ...last, content: last.content + morceau };
          return next;
        });
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : t.error);
      // La réponse vide est retirée : une bulle blanche ne dit rien.
      setMessages((prev) => prev.filter((m) => !(m.role === "assistant" && !m.content)));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="theme-slate" hidden={!open}>
      <div
          role="dialog"
          aria-modal="false"
          aria-label={t.title}
          className="fixed inset-x-0 bottom-0 z-50 flex h-[85vh] flex-col overflow-hidden rounded-t-2xl border border-line bg-paper shadow-[0_-8px_40px_-16px_rgba(16,22,15,0.35)] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[32rem] sm:w-[23rem] sm:rounded-2xl"
        >
          <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold text-ink">{t.title}</p>
              <p className="truncate text-xs text-ink-soft">{t.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.close}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-clay hover:text-ink"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </header>

          <div
            className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
            aria-live="polite"
            aria-label={t.transcript}
          >
            <p className="text-sm leading-6 text-ink-soft">{t.intro}</p>

            {messages.length === 0 && (
              <ul className="space-y-2 pt-1">
                {t.suggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => ask(s)}
                      className="w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-left text-sm text-ink transition-colors duration-150 hover:bg-clay"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${
                  m.role === "user"
                    ? "ml-auto bg-ink text-paper"
                    : "border border-line bg-clay text-ink"
                }`}
              >
                {m.role === "assistant" ? <AssistantText text={m.content} /> : m.content}
                {/* Le curseur ne s'affiche que sur la bulle en cours d'écriture. */}
                {m.role === "assistant" && streaming && i === messages.length - 1 && (
                  <span aria-hidden="true" className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-ink-soft align-middle" />
                )}
              </div>
            ))}

            {error && (
              <div role="alert" className="rounded-xl border border-err bg-err-soft px-3 py-2.5 text-sm text-ink">
                {error}
                <button
                  type="button"
                  onClick={() => {
                    const last = [...messages].reverse().find((m) => m.role === "user");
                    if (last) {
                      setMessages((prev) => prev.slice(0, prev.lastIndexOf(last)));
                      ask(last.content);
                    }
                  }}
                  className="ml-2 font-semibold text-brand-deep underline underline-offset-2"
                >
                  {t.retry}
                </button>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
            className="border-t border-line px-3 py-3"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={1200}
                placeholder={t.placeholder}
                aria-label={t.placeholder}
                className="h-11 min-w-0 flex-1 rounded-full border border-line bg-paper px-4 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              />
              <button
                type="submit"
                disabled={streaming || !draft.trim()}
                aria-label={t.send}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-[#10160F] transition-opacity duration-150 disabled:opacity-40"
              >
                <Send aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-4 text-ink-soft">
              {t.disclaimer}{" "}
              <Link
                href={locale === "en" ? "/en/contact" : "/contact"}
                className="underline underline-offset-2"
              >
                {t.human}
              </Link>
              .
            </p>
          </form>
      </div>
    </div>
  );
}
