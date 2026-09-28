"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { fixAllRoutersTicketExpiryFormat } from "@/lib/mikrotik/actions";
import type { RouterDictionary } from "./router-row";
import { FleetActionRow, type ActionMessage } from "./FleetActionRow";

/**
 * Répare, sur tout le parc, les dates d'expiration écrites au format ISO.
 *
 * RouterOS 7.24 rend les dates en « 2026-08-24 » ; sous cette forme le
 * balayage de chaque profil ne les reconnaît plus et le ticket ne s'éteint
 * jamais (voir lib/mikrotik/ticket-expiry-format.ts). Ce bouton RÉÉCRIT la
 * date au format attendu — même instant — et ne supprime rien.
 * Idempotent : on peut le rejouer après le retour d'un routeur hors ligne.
 */
export default function TicketExpiryFleetButton({ t }: { t: RouterDictionary["actions"] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionMessage | null>(null);

  return (
    <FleetActionRow
      icon={CalendarClock}
      title={t.ticketExpiry}
      summary={t.ticketExpirySummary}
      help={t.ticketExpiryHelp}
      helpLabel={t.learnMore}
      runLabel={t.runAction}
      busyLabel={t.ticketExpiryBusy}
      pending={pending}
      message={message}
      onRun={() =>
        startTransition(async () => {
          setMessage(null);
          const result = await fixAllRoutersTicketExpiryFormat();
          if ("error" in result) {
            setMessage({ kind: "err", text: result.error });
            return;
          }
          const parts: string[] = [];
          if (result.sweepsRepaired > 0) {
            parts.push(t.ticketExpirySweeps.replace("{count}", String(result.sweepsRepaired)));
          }
          parts.push(
            result.rewritten > 0
              ? t.ticketExpiryDone
                  .replace("{count}", String(result.rewritten))
                  .replace("{routers}", result.repaired.join(", "))
              : t.ticketExpiryNone.replace("{count}", String(result.routersScanned)),
          );
          if (result.unreachable.length > 0) {
            parts.push(t.retryLater.replace("{routers}", result.unreachable.join(", ")));
          }
          /* Passage borné en temps (coupure Cloudflare) : on dit combien de
             routeurs restent plutôt que de laisser croire le parc traité. */
          if (result.remaining > 0) {
            parts.push(t.ticketExpiryRemaining.replace("{count}", String(result.remaining)));
          }
          setMessage({
            kind: result.unreachable.length > 0 || result.remaining > 0 ? "warn" : "ok",
            text: parts.join(" "),
          });
          router.refresh();
        })
      }
    />
  );
}
