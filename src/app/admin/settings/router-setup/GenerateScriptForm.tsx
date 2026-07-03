"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, Loader2 } from "lucide-react";
import { generateInstallScript, checkRouterConnection } from "@/lib/mikrotik/actions";

type ConnectionState = "idle" | "waiting" | "connected" | "timeout";

export default function GenerateScriptForm() {
  const [state, formAction, pending] = useActionState(generateInstallScript, undefined);
  const [copied, setCopied] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const pollCount = useRef(0);

  useEffect(() => {
    if (!state?.success || !state.routerId) return;

    // Starting a polling loop (with its own interval + cleanup below) needs
    // to flip the UI into "waiting" the moment the action succeeds; there's
    // no render-time equivalent for "kick off an interval and reflect that".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnection("waiting");
    pollCount.current = 0;
    let cancelled = false;

    const interval = setInterval(async () => {
      pollCount.current += 1;
      const result = await checkRouterConnection(state.routerId!);
      if (cancelled) return;

      if (result?.connected) {
        setConnection("connected");
        clearInterval(interval);
      } else if (pollCount.current >= 60) {
        // ~5 minutes at 5s intervals
        setConnection("timeout");
        clearInterval(interval);
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [state]);

  function copyCommand() {
    if (!state?.command) return;
    navigator.clipboard.writeText(state.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (connection === "connected") {
    return (
      <div className="rounded-md bg-clay px-4 py-3 text-sm text-ok">
        Routeur connecté avec succès via le tunnel VPN. Consultez les
        statistiques en direct sur le{" "}
        <Link href="/admin/router" className="font-semibold underline">
          tableau de bord du routeur
        </Link>
        .
      </div>
    );
  }

  if (state?.success && state.command) {
    return (
      <div>
        <h3 className="text-sm font-medium text-ink">
          Script d&apos;installation de l&apos;accès distant
        </h3>
        <p className="text-sm text-ink-soft">
          Copiez cette commande et collez-la dans le terminal MikroTik
          RouterOS.
        </p>
        <div className="relative mt-2">
          <pre className="code-block p-4 pr-12">
            {state.command}
          </pre>
          <button
            onClick={copyCommand}
            className="absolute right-2 top-2 rounded-md bg-[#3A362F] p-1.5 text-clay hover:bg-[#3A362F]"
            title="Copier la commande"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm text-ink-soft">
          {connection === "waiting" && (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              En attente de connexion du routeur...
            </>
          )}
          {connection === "timeout" && (
            <span className="text-warn">
              Toujours en attente après 5 minutes. Vérifiez que la commande
              s&apos;est exécutée sans erreur sur le routeur, puis laissez cette
              page ouverte.
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-ink">
          Nom du routeur
        </label>
        <input
          name="name"
          required
          placeholder="hAP ac lite"
          className="w-full rounded-md border border-line-soft px-3 py-2 text-sm placeholder:text-ink-soft focus:border-line-soft focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-[#3A362F] disabled:opacity-60"
      >
        {pending ? "Génération..." : "Générer le script d'installation"}
      </button>
    </form>
  );
}
