"use client";

import { useState } from "react";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { getMikhmonLink } from "@/lib/mikrotik/mikhmon-online";

type RouterRow = { id: string; name: string; status: string };

type LinkResult =
  | { error: string }
  | { success: true; ready: false; message: string; localLink: string | null; tunnelLink: string | null }
  | {
      success: true;
      ready: true;
      reachable: boolean;
      link: string;
      ddnsName: string;
      localLink: string | null;
      tunnelLink: string | null;
      message?: string;
    }
  | null;

function RouterMikhmonCard({ router }: { router: RouterRow }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<LinkResult>(null);

  async function handleFetch() {
    setPending(true);
    const res = await getMikhmonLink(router.id);
    setPending(false);
    setResult(res as LinkResult);
  }

  return (
    <div className="rounded-lg border border-line-soft p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">{router.name}</span>
        <button
          type="button"
          onClick={handleFetch}
          disabled={pending || router.status !== "online"}
          className="flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-deep-line disabled:opacity-50"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pending ? "Recherche..." : "Obtenir le lien"}
        </button>
      </div>

      {router.status !== "online" && (
        <p className="mt-1 text-xs text-ink-soft">
          Le routeur doit être en ligne pour récupérer son lien Mikhmon.
        </p>
      )}

      {result && "error" in result && (
        <p className="mt-2 text-xs text-red-600">{result.error}</p>
      )}

      {result && "success" in result && !result.ready && (
        <p className="mt-2 text-xs text-warn">{result.message}</p>
      )}

      {result && "success" in result && result.ready && (
        <div className="mt-2 space-y-1">
          <div>
            <p className="text-[11px] text-ink-soft">Accès distant (Internet — ACCES DISTANT, port 8088)</p>
            <a
              href={result.link}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1.5 text-sm font-medium hover:underline ${
                result.reachable ? "text-ok" : "text-warn"
              }`}
            >
              {result.link}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {!result.reachable && result.message && (
              <p className="mt-1 flex items-start gap-1.5 rounded-md bg-clay px-2.5 py-2 text-xs text-warn">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {result.message}
              </p>
            )}
          </div>
          {result.tunnelLink && (
            <div>
              <p className="text-[11px] text-ink-soft">
                Accès via tunnel VPN (Accès distant — MikHmon, fonctionne même derrière un CGNAT)
              </p>
              <a
                href={result.tunnelLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm font-medium text-ok hover:underline"
              >
                {result.tunnelLink}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
          {result.localLink && (
            <div>
              <p className="text-[11px] text-ink-soft">
                Accès local (réseau hotspot — Docker NAT, port 8087)
              </p>
              <a
                href={result.localLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:underline"
              >
                {result.localLink}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
        </div>
      )}
      {result && "success" in result && !result.ready && (result.localLink || result.tunnelLink) && (
        <div className="mt-1 space-y-1">
          {result.tunnelLink && (
            <a
              href={result.tunnelLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-ok hover:underline"
            >
              {result.tunnelLink}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {result.localLink && (
            <a
              href={result.localLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:underline"
            >
              {result.localLink}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function MikhmonOnlineList({ routers }: { routers: RouterRow[] }) {
  if (routers.length === 0) {
    return (
      <p className="mt-6 rounded-md bg-clay px-3 py-2.5 text-sm text-ink-soft">
        Aucun routeur lié pour le moment — ajoutez-en un depuis la page Routeur.
      </p>
    );
  }

  return <div className="mt-4 space-y-3">{routers.map((r) => <RouterMikhmonCard key={r.id} router={r} />)}</div>;
}
