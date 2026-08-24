"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { refreshRouterStats } from "@/lib/mikrotik/actions";

export default function RefreshButton({ routerId }: { routerId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-err">{error}</span>}
      <button
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await refreshRouterStats(routerId);
            setError(result?.error ?? null);
            router.refresh();
          })
        }
        className="flex items-center gap-2 rounded-md border border-line-soft bg-paper px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-clay disabled:opacity-60"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Synchronisation..." : "Synchroniser"}
      </button>
    </div>
  );
}
