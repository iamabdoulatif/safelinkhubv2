"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Loader2 } from "lucide-react";
import { applyWanStealthFleet } from "@/lib/mikrotik/wan-stealth-actions";
import type { RouterDictionary } from "./RoutersTable";

/**
 * Masque TOUT le parc vis-à-vis des box des fournisseurs.
 *
 * Les trois réglages par défaut (nom annoncé, découverte de voisinage, DDNS
 * MikroTik) ne coupent rien : ils passent en pleine journée. La MAC est une
 * case SÉPARÉE, décochée, parce qu'elle renégocie le bail DHCP et coupe le WAN
 * de chaque site quelques secondes — à lancer sur un creux.
 *
 * Idempotent et repris en plusieurs passages : un routeur déjà discret ne
 * produit aucune commande, et le passage s'arrête avant la coupure Cloudflare
 * en annonçant combien de routeurs restent (voir applyWanStealthFleet).
 */
export default function WanStealthFleetButton({ t }: { t: RouterDictionary["actions"] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [spoofMac, setSpoofMac] = useState(false);
  const [hideUpstream, setHideUpstream] = useState(true);
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            spoofMac &&
            !window.confirm(
              "Remplacer la MAC d'usine renégocie le bail DHCP de CHAQUE routeur : quelques secondes sans Internet sur chaque site. Continuer ?",
            )
          ) {
            return;
          }
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
        className="flex items-center gap-2 border border-line bg-paper px-4 py-2 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay disabled:cursor-not-allowed disabled:opacity-60 rounded-xl"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <EyeOff className="h-4 w-4" />}
        {pending ? t.stealthBusy : t.stealth}
      </button>

      <label className="flex items-start gap-2 text-xs text-ink-soft">
        <input
          type="checkbox"
          checked={hideUpstream}
          onChange={(e) => setHideUpstream(e.target.checked)}
          disabled={pending}
          className="mt-0.5 h-4 w-4"
        />
        {t.stealthUpstream}
      </label>
      <label className="flex items-start gap-2 text-xs text-ink-soft">
        <input
          type="checkbox"
          checked={spoofMac}
          onChange={(e) => setSpoofMac(e.target.checked)}
          disabled={pending}
          className="mt-0.5 h-4 w-4"
        />
        {t.stealthMac}
      </label>

      {message && (
        <span
          className={`max-w-md text-xs ${
            message.kind === "err" ? "text-err" : message.kind === "warn" ? "text-warn" : "text-ok"
          }`}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
