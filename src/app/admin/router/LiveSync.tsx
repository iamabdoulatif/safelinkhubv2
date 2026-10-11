"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { refreshFleetStats, refreshRouterStats } from "@/lib/mikrotik/actions";

const INTERVAL_MS = 30_000;

/**
 * Resynchronise toutes les 30 s tant que l'onglet est visible, pour que les
 * connectés actifs suivent MikHmon. Sans routerId : tout le parc visible.
 */
export default function LiveSync({ routerId }: { routerId?: string }) {
  const router = useRouter();

  useEffect(() => {
    let running = false;
    const tick = async () => {
      // Une synchro lente (routeur hors ligne : jusqu'à ~60 s) ne doit pas s'empiler.
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try {
        await (routerId ? refreshRouterStats(routerId) : refreshFleetStats());
        router.refresh();
      } finally {
        running = false;
      }
    };
    const id = window.setInterval(tick, INTERVAL_MS);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, routerId]);

  return null;
}
