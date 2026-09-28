"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Unlink } from "lucide-react";
import { fixAllRoutersMacBoundTickets } from "@/lib/mikrotik/actions";
import type { RouterDictionary } from "./router-row";
import { FleetActionRow, type ActionMessage } from "./FleetActionRow";

/**
 * Répare, sur tout le parc, les tickets épinglés à une adresse MAC.
 *
 * Le correctif de fond est dans fulfill.ts (les nouveaux tickets ne sont plus
 * épinglés) ; ce bouton répare ceux DÉJÀ vendus, qui resteraient cassés sinon.
 * Idempotent : on peut le rejouer après le retour d'un routeur hors ligne.
 */
export default function UnbindMacTicketsButton({ t }: { t: RouterDictionary["actions"] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionMessage | null>(null);

  return (
    <FleetActionRow
      icon={Unlink}
      title={t.unbind}
      summary={t.unbindSummary}
      help={t.unbindHelp}
      helpLabel={t.learnMore}
      runLabel={t.runAction}
      busyLabel={t.unbinding}
      pending={pending}
      message={message}
      onRun={() =>
        startTransition(async () => {
          setMessage(null);
          const result = await fixAllRoutersMacBoundTickets();
          if ("error" in result) {
            setMessage({ kind: "err", text: result.error });
            return;
          }
          const parts: string[] = [
            result.unbound > 0
              ? t.unbindDone
                  .replace("{count}", String(result.unbound))
                  .replace("{routers}", result.repaired.join(", "))
              : t.unbindNone.replace("{count}", String(result.routersScanned)),
          ];
          if (result.skippedRoaming > 0) {
            parts.push(t.unbindRoamingSkipped.replace("{count}", String(result.skippedRoaming)));
          }
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
    />
  );
}
