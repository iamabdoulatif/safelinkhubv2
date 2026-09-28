"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, EyeOff } from "lucide-react";
import { applyWanStealthFleet } from "@/lib/mikrotik/wan-stealth-actions";
import type { RouterDictionary } from "./router-row";
import { FleetActionRow, type ActionMessage } from "./FleetActionRow";

/**
 * Masque TOUT le parc vis-à-vis des box des fournisseurs.
 *
 * Les trois réglages par défaut (nom annoncé, découverte de voisinage, DDNS
 * MikroTik) ne coupent rien. La MAC est une case SÉPARÉE, décochée, parce
 * qu'elle renégocie le bail DHCP et coupe le WAN de chaque site quelques
 * secondes — d'où la confirmation et le marquage « attention ».
 * Idempotent et repris en plusieurs passages (voir applyWanStealthFleet).
 */
export default function WanStealthFleetButton({ t }: { t: RouterDictionary["actions"] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [spoofMac, setSpoofMac] = useState(false);
  const [hideUpstream, setHideUpstream] = useState(true);
  const [message, setMessage] = useState<ActionMessage | null>(null);

  return (
    <FleetActionRow
      icon={EyeOff}
      title={t.stealth}
      summary={t.stealthSummary}
      help={t.stealthHelp}
      helpLabel={t.learnMore}
      runLabel={t.runAction}
      busyLabel={t.stealthBusy}
      pending={pending}
      message={message}
      onRun={() => {
        if (spoofMac && !window.confirm(t.stealthMacConfirm)) return;
        startTransition(async () => {
          setMessage(null);
          const result = await applyWanStealthFleet({ spoofMac, hideUpstream });
          if ("error" in result) {
            setMessage({ kind: "err", text: result.error });
            return;
          }
          const parts: string[] = [
            result.masques.length > 0
              ? t.stealthDone
                  .replace("{count}", String(result.masques.length))
                  .replace("{routers}", result.masques.join(", "))
              : t.stealthNone.replace("{count}", String(result.traites)),
          ];
          if (result.injoignables.length > 0) {
            parts.push(t.retryLater.replace("{routers}", result.injoignables.join(", ")));
          }
          if (result.restants > 0) {
            parts.push(t.stealthRemaining.replace("{count}", String(result.restants)));
          }
          setMessage({
            kind: result.injoignables.length > 0 || result.restants > 0 ? "warn" : "ok",
            text: parts.join(" "),
          });
          router.refresh();
        });
      }}
    >
      <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-ink">
        <input
          type="checkbox"
          checked={hideUpstream}
          onChange={(e) => setHideUpstream(e.target.checked)}
          disabled={pending}
          className="mt-0.5 h-4 w-4 shrink-0 accent-ink"
        />
        {t.stealthUpstream}
      </label>
      <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-ink">
        <input
          type="checkbox"
          checked={spoofMac}
          onChange={(e) => setSpoofMac(e.target.checked)}
          disabled={pending}
          className="mt-0.5 h-4 w-4 shrink-0 accent-ink"
        />
        <span>
          {t.stealthMac}
          <span className="mt-0.5 flex items-center gap-1 font-semibold text-warn">
            <AlertTriangle aria-hidden="true" className="h-3 w-3" />
            {t.stealthMacWarn}
          </span>
        </span>
      </label>
    </FleetActionRow>
  );
}
