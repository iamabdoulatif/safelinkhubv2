"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Unlink } from "lucide-react";
import { fixAllRoutersMacBoundTickets } from "@/lib/mikrotik/actions";
import type { RouterDictionary } from "./RoutersTable";

/**
 * Répare, sur tout le parc, les tickets épinglés à une adresse MAC.
 *
 * Le correctif de fond est dans fulfill.ts (les nouveaux tickets ne sont plus
 * épinglés) ; ce bouton répare ceux DÉJÀ vendus, qui resteraient cassés sinon.
 * Une fois le parc nettoyé, il ne trouve plus rien — il est sans effet à le
 * relancer, et c'est voulu : on peut le rejouer après le retour d'un routeur
 * hors ligne.
 */
export default function UnbindMacTicketsButton({ t }: { t: RouterDictionary["actions"] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {message && (
        <span
          className={`max-w-md text-xs ${
            message.kind === "err" ? "text-err" : message.kind === "warn" ? "text-warn" : "text-ok"
          }`}
        >
          {message.text}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        title={t.unbindHelp}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await fixAllRoutersMacBoundTickets();
            if ("error" in result) {
              setMessage({ kind: "err", text: result.error });
              return;
            }
            const parts: string[] = [];
            parts.push(
              result.unbound > 0
                ? t.unbindDone
                    .replace("{count}", String(result.unbound))
                    .replace("{routers}", result.repaired.join(", "))
                : t.unbindNone.replace("{count}", String(result.routersScanned)),
            );
            if (result.skippedRoaming > 0) {
              parts.push(t.unbindRoamingSkipped.replace("{count}", String(result.skippedRoaming)));
            }
            if (result.unreachable.length > 0) {
              parts.push(
                t.retryLater.replace("{routers}", result.unreachable.join(", ")),
              );
            }
            setMessage({
              kind: result.unreachable.length > 0 ? "warn" : "ok",
              text: parts.join(" "),
            });
            router.refresh();
          })
        }
        className="flex items-center gap-2 border border-line bg-paper px-4 py-2 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay disabled:cursor-not-allowed disabled:opacity-60 rounded-xl"
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <Unlink aria-hidden="true" className="h-4 w-4" />
        )}
        {pending ? t.unbinding : t.unbind}
      </button>
    </div>
  );
}
