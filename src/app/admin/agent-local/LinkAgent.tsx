"use client";

import { useState, useTransition } from "react";
import { KeyRound, Copy, Check } from "lucide-react";
import { generateAgentLinkCode } from "@/lib/agent-link/actions";

export default function LinkAgent() {
  const [pending, start] = useTransition();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <section className="mt-4 rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center gap-2">
        <KeyRound aria-hidden="true" className="h-5 w-5 text-ink" />
        <h2 className="text-base font-semibold text-ink">Lier l&apos;agent à cette organisation</h2>
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        Pour la <b>configuration automatique</b> (forfaits, portail, Wi-Fi proposés dans l&apos;agent),
        générez un code et collez-le dans l&apos;agent une fois. Valable 2 heures.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await generateAgentLinkCode();
              if (r.ok) { setCode(r.code); setCopied(false); } else setError(r.error);
            })
          }
          className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Génération…" : code ? "Générer un nouveau code" : "Générer un code de liaison"}
        </button>
        {code && (
          <div className="flex items-center gap-2 rounded-full border border-line bg-clay px-4 py-2">
            <code className="font-mono text-sm font-semibold tracking-wide text-ink">{code}</code>
            <button
              type="button"
              aria-label="Copier le code"
              onClick={() => { void navigator.clipboard?.writeText(code); setCopied(true); }}
              className="text-ink-soft hover:text-ink"
            >
              {copied ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-err">{error}</p>}
      {code && <p className="mt-3 text-xs text-ink-soft">Collez ce code dans l&apos;agent → onglet « Configuration automatique ». Ne le partagez pas : il autorise à configurer et facturer sur votre compte.</p>}
    </section>
  );
}
