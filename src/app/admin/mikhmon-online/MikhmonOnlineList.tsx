"use client";

import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { getMikhmonLink } from "@/lib/mikrotik/mikhmon-online";

type RouterRow = { id: string; name: string; status: string };

type LinkResult =
  | { error: string }
  | { success: true; ready: false; message: string }
  | { success: true; ready: true; link: string; ddnsName: string }
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
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">{router.name}</span>
        <button
          type="button"
          onClick={handleFetch}
          disabled={pending || router.status !== "online"}
          className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pending ? "Recherche..." : "Obtenir le lien"}
        </button>
      </div>

      {router.status !== "online" && (
        <p className="mt-1 text-xs text-slate-400">
          Le routeur doit être en ligne pour récupérer son lien Mikhmon.
        </p>
      )}

      {result && "error" in result && (
        <p className="mt-2 text-xs text-red-600">{result.error}</p>
      )}

      {result && "success" in result && !result.ready && (
        <p className="mt-2 text-xs text-amber-600">{result.message}</p>
      )}

      {result && "success" in result && result.ready && (
        <a
          href={result.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline"
        >
          {result.link}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

export default function MikhmonOnlineList({ routers }: { routers: RouterRow[] }) {
  if (routers.length === 0) {
    return (
      <p className="mt-6 rounded-md bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
        Aucun routeur lié pour le moment — ajoutez-en un depuis la page Routeur.
      </p>
    );
  }

  return <div className="mt-4 space-y-3">{routers.map((r) => <RouterMikhmonCard key={r.id} router={r} />)}</div>;
}
