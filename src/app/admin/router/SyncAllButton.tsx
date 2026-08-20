"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { refreshAllRouters } from "@/lib/mikrotik/actions";

export default function SyncAllButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-err">{error}</span>}
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await refreshAllRouters();
            setError(result?.error ?? null);
            router.refresh();
          })
        }
        className="flex items-center gap-2 border border-line bg-paper px-4 py-2 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay disabled:cursor-not-allowed disabled:opacity-60 rounded-xl"
      >
        <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Synchronisation..." : "Synchroniser"}
      </button>
    </div>
  );
}
