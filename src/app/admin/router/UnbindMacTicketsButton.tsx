"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Unlink } from "lucide-react";
import { fixAllRoutersMacBoundTickets } from "@/lib/mikrotik/actions";

/**
 * Répare, sur tout le parc, les tickets épinglés à une adresse MAC.
 *
 * Le correctif de fond est dans fulfill.ts (les nouveaux tickets ne sont plus
 * épinglés) ; ce bouton répare ceux DÉJÀ vendus, qui resteraient cassés sinon.
 * Une fois le parc nettoyé, il ne trouve plus rien — il est sans effet à le
 * relancer, et c'est voulu : on peut le rejouer après le retour d'un routeur
 * hors ligne.
 */
export default function UnbindMacTicketsButton() {
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
        title="Les tickets vendus au portail étaient liés au MAC du client, qui change avec la MAC privée aléatoire des téléphones. Ce bouton les délie."
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
                ? `${result.unbound} ticket(s) délié(s) sur ${result.repaired.join(", ")}.`
                : `Aucun ticket épinglé sur les ${result.routersScanned} routeur(s) joignables.`,
            );
            if (result.skippedRoaming > 0) {
              parts.push(`${result.skippedRoaming} compte(s) de roaming épargné(s).`);
            }
            if (result.unreachable.length > 0) {
              parts.push(
                `Hors ligne, à relancer plus tard : ${result.unreachable.join(", ")}.`,
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
        {pending ? "Déliage..." : "Délier les tickets MAC"}
      </button>
    </div>
  );
}
