"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, RefreshCw, Trash2, Gauge, Zap, Activity, PackageOpen, LayoutTemplate } from "lucide-react";
import {
  deleteRouter,
  optimizeRouterWifi,
  refreshRouterStats,
  optimizeRouterThroughput,
  speedTestRouter,
} from "@/lib/mikrotik/actions";
import { reinstallMikhmonContainer } from "@/lib/mikrotik/container-setup";
import { reposerPortailRouteur } from "@/lib/captive-templates/actions";

export default function HeaderActions({ routerId }: { routerId: string }) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [isOptimizing, startOptimize] = useTransition();
  const [isReinstalling, startReinstall] = useTransition();
  const [isReposing, startRepose] = useTransition();
  const [isTuning, startTune] = useTransition();
  const [isTesting, startTest] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  if (confirmingDelete) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">
          Supprimer définitivement ce routeur ?
        </span>
        <button
          type="button"
          disabled={isDeleting}
          onClick={() =>
            startDelete(async () => {
              const result = await deleteRouter(routerId);
              if (result?.error) {
                setError(result.error);
                setConfirmingDelete(false);
                return;
              }
              router.push("/admin/router");
              router.refresh();
            })
          }
          className="flex items-center gap-1.5 border border-err bg-err px-3 py-1.5 text-sm font-bold text-white transition-colors duration-150 hover:bg-paper hover:text-err disabled:opacity-60"
        >
          {isDeleting ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          )}
          Confirmer
        </button>
        <button
          type="button"
          disabled={isDeleting}
          onClick={() => setConfirmingDelete(false)}
          className="border border-line bg-paper px-3 py-1.5 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay rounded-xl"
        >
          Annuler
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && (
        <span role="alert" className="text-xs font-medium text-err">
          {error}
        </span>
      )}
      {ok && (
        <span role="status" className="text-xs font-medium text-ok">
          {ok}
        </span>
      )}
      <button
        type="button"
        disabled={isRefreshing}
        onClick={() =>
          startRefresh(async () => {
            setError(null);
            setOk(null);
            const result = await refreshRouterStats(routerId);
            setError(result?.error ?? null);
            router.refresh();
          })
        }
        className="flex items-center gap-1.5 border border-line bg-brand px-3 py-1.5 text-sm font-bold text-slate-deep transition-colors duration-150 hover:bg-ink hover:text-paper disabled:opacity-60 rounded-full"
      >
        <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        {isRefreshing ? "Actualisation..." : "Actualiser"}
      </button>
      <button
        type="button"
        disabled={isReinstalling}
        title="Arrête, supprime et recrée le conteneur MikHmon au même emplacement (1 à 3 min : re-téléchargement de l'image)"
        onClick={() =>
          startReinstall(async () => {
            setError(null);
            setOk(null);
            const result = await reinstallMikhmonContainer(routerId);
            if (result?.error) setError(result.error);
            else setOk(result?.summary ?? "Réinstallation lancée.");
            router.refresh();
          })
        }
        className="flex items-center gap-1.5 border border-line bg-paper px-3 py-1.5 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay disabled:opacity-60 rounded-xl"
      >
        {isReinstalling ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <PackageOpen aria-hidden="true" className="h-4 w-4" />
        )}
        {isReinstalling ? "Lancement…" : "Réinstaller MikHmon"}
      </button>
      <button
        type="button"
        disabled={isReposing}
        title="Réécrit les fichiers du portail sur le routeur. Les prix y sont figés au téléchargement : c'est ce geste qui fait redescendre un tarif corrigé dans Forfaits."
        onClick={() =>
          startRepose(async () => {
            setError(null);
            setOk(null);
            const result = await reposerPortailRouteur(routerId);
            if ("error" in result && result.error) setError(result.error);
            else {
              const nom = "portail" in result ? result.portail : "captif";
              setOk(`Portail « ${nom} » reposé — les prix affichés suivent maintenant la page Forfaits.`);
            }
            router.refresh();
          })
        }
        className="flex items-center gap-1.5 border border-line bg-paper px-3 py-1.5 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay disabled:opacity-60 rounded-xl"
      >
        {isReposing ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <LayoutTemplate aria-hidden="true" className="h-4 w-4" />
        )}
        {isReposing ? "Envoi…" : "Reposer le portail"}
      </button>
      <button
        type="button"
        disabled={isOptimizing}
        title="Unifie le SSID (band steering) + 5 GHz en 80 MHz + 2,4 GHz en 20 MHz"
        onClick={() =>
          startOptimize(async () => {
            setError(null);
            setOk(null);
            const result = await optimizeRouterWifi(routerId);
            if (result?.error) setError(result.error);
            else setOk(result?.summary ? `WiFi optimisé — ${result.summary}` : "WiFi optimisé.");
            router.refresh();
          })
        }
        className="flex items-center gap-1.5 border border-line bg-paper px-3 py-1.5 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay disabled:opacity-60 rounded-xl"
      >
        {isOptimizing ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <Gauge aria-hidden="true" className="h-4 w-4" />
        )}
        {isOptimizing ? "Optimisation..." : "Optimiser le WiFi"}
      </button>
      <button
        type="button"
        disabled={isTuning}
        title="Active le fasttrack (connexions établies) et désactive le layer7 — débloque le débit routé sans casser le filtrage"
        onClick={() =>
          startTune(async () => {
            setError(null);
            setOk(null);
            const result = await optimizeRouterThroughput(routerId);
            if (result?.error) setError(result.error);
            else setOk(result?.summary ? `Débit optimisé — ${result.summary}` : "Débit optimisé.");
            router.refresh();
          })
        }
        className="flex items-center gap-1.5 border border-line bg-paper px-3 py-1.5 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay disabled:opacity-60 rounded-xl"
      >
        {isTuning ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <Zap aria-hidden="true" className="h-4 w-4" />
        )}
        {isTuning ? "Optimisation..." : "Optimiser le débit"}
      </button>
      <button
        type="button"
        disabled={isTesting}
        title="Mesure le débit descendant réel du WAN du routeur (téléchargement de test ~40 Mo)"
        onClick={() =>
          startTest(async () => {
            setError(null);
            setOk(null);
            const result = await speedTestRouter(routerId);
            if (result?.error) setError(result.error);
            else setOk(result?.summary ?? "Test de débit terminé.");
          })
        }
        className="flex items-center gap-1.5 border border-line bg-paper px-3 py-1.5 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay disabled:opacity-60 rounded-xl"
      >
        {isTesting ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <Activity aria-hidden="true" className="h-4 w-4" />
        )}
        {isTesting ? "Test en cours..." : "Test débit"}
      </button>
      <Link
        href="/admin/settings/router-setup"
        className="flex items-center gap-1.5 border border-line bg-paper px-3 py-1.5 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay rounded-xl"
      >
        <Pencil aria-hidden="true" className="h-4 w-4" />
        Modifier
      </Link>
      <button
        type="button"
        onClick={() => setConfirmingDelete(true)}
        className="flex items-center gap-1.5 border border-line bg-paper px-3 py-1.5 text-sm font-bold text-err transition-colors duration-150 hover:bg-err hover:text-white rounded-xl"
      >
        <Trash2 aria-hidden="true" className="h-4 w-4" />
        Supprimer
      </button>
    </div>
  );
}
