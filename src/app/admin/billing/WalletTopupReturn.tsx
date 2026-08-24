"use client";

// Au retour du checkout GeniusPay (URL /admin/billing?topup=success&transaction=…),
// sonde le statut du dépôt côté serveur (re-vérification v3, pas le webhook) et
// rafraîchit la page dès qu'il est confirmé. Bannière d'état pendant l'attente.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Loader2 } from "lucide-react";
import { confirmWalletTopupPayment } from "@/lib/wallet/actions";

type Phase = "checking" | "completed" | "failed";

export default function WalletTopupReturn({ transactionId }: { transactionId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");

  useEffect(() => {
    let active = true;
    let tries = 0;
    const max = 20; // ~20 × 3 s = 1 min

    async function tick() {
      if (!active) return;
      tries += 1;
      try {
        const { status } = await confirmWalletTopupPayment(transactionId);
        if (!active) return;
        if (status === "completed") {
          setPhase("completed");
          router.refresh(); // met à jour le solde + le journal
          return;
        }
        if (status === "failed") {
          setPhase("failed");
          return;
        }
      } catch {
        // transitoire : on continue de sonder
      }
      if (active && tries < max) timer = setTimeout(tick, 3000);
    }

    let timer = setTimeout(tick, 500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [transactionId, router]);

  if (phase === "completed") {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-md border border-ok bg-ok-soft px-3 py-2.5 text-sm text-ok">
        <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
        Dépôt confirmé et crédité sur votre portefeuille.
      </div>
    );
  }
  if (phase === "failed") {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-md border border-err bg-err-soft px-3 py-2.5 text-sm text-err">
        <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
        Le paiement n’a pas abouti. Aucun montant n’a été débité par SafeLinkHub.
      </div>
    );
  }
  return (
    <div className="mb-4 flex items-center gap-2 rounded-md border border-line-soft bg-clay px-3 py-2.5 text-sm text-ink-soft">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
      Confirmation du dépôt en cours… (quelques secondes)
    </div>
  );
}
