"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { fixAllRoutersMikhmonLocalAccess } from "@/lib/mikrotik/actions";
import { FleetActionRow, type ActionMessage } from "./FleetActionRow";

/**
 * Laisser passer MikHmon EN LOCAL sur TOUT le parc : pose, là où elles
 * manquent, la redirection 8087 et la règle hotspot qui débloquent l'accès à
 * http://<passerelle>:8087 depuis le Wi-Fi. Idempotent, repris en plusieurs
 * passages (routeurs hors ligne).
 */
export default function MikhmonLocalAccessFleetButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionMessage | null>(null);

  return (
    <FleetActionRow
      icon={Globe}
      title="Autoriser l'accès local à MikHmon"
      summary="Ouvre http://<passerelle>:8087 depuis le Wi-Fi de chaque site."
      help="Le hotspot bloque par défaut l'accès local à MikHmon. Cette action ajoute, sur chaque routeur en ligne, la redirection du port 8087 vers le conteneur et la règle hotspot qui le laisse passer avant connexion. Déjà en place = laissé tel quel."
      helpLabel="En savoir plus"
      runLabel="Lancer"
      busyLabel="Ouverture en cours…"
      pending={pending}
      message={message}
      onRun={() =>
        startTransition(async () => {
          setMessage(null);
          const result = await fixAllRoutersMikhmonLocalAccess();
          if ("error" in result) {
            setMessage({ kind: "err", text: result.error });
            return;
          }
          const parts: string[] = [];
          if (result.opened.length) parts.push(`Accès local ouvert sur : ${result.opened.join(", ")}.`);
          if (result.already.length) parts.push(`Déjà ouvert : ${result.already.length} routeur(s).`);
          if (!result.opened.length && !result.already.length) parts.push(`Aucun routeur avec hotspot à ouvrir (${result.routersScanned} scanné(s)).`);
          if (result.unreachable.length) parts.push(`Hors ligne, à relancer : ${result.unreachable.join(", ")}.`);
          setMessage({ kind: result.unreachable.length ? "warn" : "ok", text: parts.join(" ") });
          router.refresh();
        })
      }
    />
  );
}
