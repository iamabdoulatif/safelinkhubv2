"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2 } from "lucide-react";
import { fixAllRoutersTicketExpiryFormat } from "@/lib/mikrotik/actions";
import type { RouterDictionary } from "./RoutersTable";

/**
 * Répare, sur tout le parc, les dates d'expiration écrites au format ISO.
 *
 * RouterOS 7.24 rend les dates en « 2026-08-24 » ; sous cette forme le
 * balayage de chaque profil ne les reconnaît plus et le ticket ne s'éteint
 * jamais (voir lib/mikrotik/ticket-expiry-format.ts). Ce bouton RÉÉCRIT la
 * date au format attendu — même instant — et ne supprime rien : c'est le
 * balayage du routeur qui retire les périmés à son passage suivant.
 *
 * Idempotent : une fois le parc réécrit, il ne trouve plus rien. On peut donc
 * le rejouer après le retour d'un routeur hors ligne.
 */
export default function TicketExpiryFleetButton({ t }: { t: RouterDictionary["actions"] }) {
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
        title={t.ticketExpiryHelp}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await fixAllRoutersTicketExpiryFormat();
            if ("error" in result) {
              setMessage({ kind: "err", text: result.error });
              return;
            }
            const parts: string[] = [
              result.rewritten > 0
                ? t.ticketExpiryDone
                    .replace("{count}", String(result.rewritten))
                    .replace("{routers}", result.repaired.join(", "))
                : t.ticketExpiryNone.replace("{count}", String(result.routersScanned)),
            ];
            if (result.unreachable.length > 0) {
              parts.push(t.retryLater.replace("{routers}", result.unreachable.join(", ")));
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
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CalendarClock className="h-4 w-4" />
        )}
        {pending ? t.ticketExpiryBusy : t.ticketExpiry}
      </button>
    </div>
  );
}
