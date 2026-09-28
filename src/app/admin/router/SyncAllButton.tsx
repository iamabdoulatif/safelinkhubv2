"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { refreshAllRouters } from "@/lib/mikrotik/actions";
import type { RouterDictionary } from "./router-row";
import { FleetActionRow, type ActionMessage } from "./FleetActionRow";

export default function SyncAllButton({ t }: { t: RouterDictionary["actions"] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionMessage | null>(null);

  return (
    <FleetActionRow
      icon={RefreshCw}
      title={t.sync}
      summary={t.syncSummary}
      runLabel={t.runAction}
      busyLabel={t.syncing}
      pending={isPending}
      message={message}
      onRun={() =>
        startTransition(async () => {
          setMessage(null);
          const result = await refreshAllRouters();
          setMessage(
            result && "error" in result && result.error
              ? { kind: "err", text: result.error }
              : { kind: "ok", text: t.syncDone },
          );
          router.refresh();
        })
      }
    />
  );
}
