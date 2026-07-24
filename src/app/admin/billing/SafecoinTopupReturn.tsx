"use client";

// Au retour du checkout GeniusPay (URL /admin/billing?safecoin_topup=success&transaction=…),
// sonde le statut de la recharge Safecoin (re-vérification v3, pas le webhook) et
// rafraîchit la page dès qu'elle est confirmée.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Loader2 } from "lucide-react";
import { confirmSafecoinTopupPayment } from "@/lib/safecoin/actions";

type Phase = "checking" | "completed" | "failed";

export default function SafecoinTopupReturn({ transactionId }: { transactionId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");

  useEffect(() => {
    let active = true;
    let tries = 0;
    const max = 20;

    async function tick() {
      if (!active) return;
      tries += 1;
      try {
        const { status } = await confirmSafecoinTopupPayment(transactionId);
        if (!active) return;
        if (status === "completed") {
          setPhase("completed");
          router.refresh();
          return;
        }
        if (status === "failed") {
          setPhase("failed");
          return;
        }
      } catch {
        /* transitoire : on continue */
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
      <div className="mb-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-800">
        <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
        Recharge Safecoin confirmée et créditée.
      </div>
    );
  }
  if (phase === "failed") {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
        <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
        La recharge Safecoin n’a pas abouti. Aucun montant n’a été débité par SafeLinkHub.
      </div>
    );
  }
  return (
    <div className="mb-4 flex items-center gap-2 rounded-md border border-line-soft bg-clay px-3 py-2.5 text-sm text-ink-soft">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
      Confirmation de la recharge Safecoin en cours…
    </div>
  );
}
