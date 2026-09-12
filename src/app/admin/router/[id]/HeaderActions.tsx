"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Activity,
  ChevronDown,
  Gauge,
  LayoutTemplate,
  Loader2,
  PackageOpen,
  Pencil,
  RefreshCw,
  Trash2,
  Wrench,
  Zap,
} from "lucide-react";
import {
  deleteRouter,
  optimizeRouterWifi,
  refreshRouterStats,
  optimizeRouterThroughput,
  speedTestRouter,
} from "@/lib/mikrotik/actions";
import { reinstallMikhmonContainer } from "@/lib/mikrotik/container-setup";
import { reposerPortailRouteur } from "@/lib/captive-templates/actions";
import type { ActionDestructive } from "@/lib/mikrotik/action-destructive";
import RouterDangerDialog from "../RouterDangerDialog";

/**
 * Barre d'actions de la fiche routeur — quatre niveaux, pas huit boutons.
 *
 *   1. « Tester le débit » : la seule action PRIMAIRE. C'est la question du
 *      quotidien (« le lien tient-il ? ») et elle ne casse rien.
 *   2. « Modifier » (secondaire) et « Maintenance ▾ » : les gestes rares
 *      (reposer le portail, optimiser WiFi/débit) rangés hors de vue, avec la
 *      réinstallation de MikHmon isolée en rouge en bas du menu.
 *   3. « Actualiser » : passif, donc discret — un bouton fantôme collé à la
 *      fraîcheur de la synchro qu'il rafraîchit.
 *   4. « Supprimer » : seul, tout à droite, séparé par un filet — jamais
 *      voisin d'un bouton bénin. Toute action destructive passe par le
 *      dialogue de conséquences du parc (RouterDangerDialog).
 */
const BTN =
  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-bold transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed";
const PRIMARY = `${BTN} border-brand bg-brand text-slate-deep hover:bg-ink hover:border-ink hover:text-paper`;
const SECONDARY = `${BTN} border-line bg-paper text-ink hover:bg-clay`;
const GHOST = `${BTN} border-transparent bg-transparent text-ink-soft hover:bg-clay hover:text-ink`;
const DANGER = `${BTN} border-err/40 bg-paper text-err hover:bg-err hover:border-err hover:text-white`;

type Notice = { kind: "ok" | "err"; text: string } | null;

export default function HeaderActions({
  routerId,
  routerName,
  syncedLabel,
  stale,
}: {
  routerId: string;
  routerName: string;
  /** « il y a 13 min » — la fraîcheur que « Actualiser » rafraîchit. */
  syncedLabel: string;
  /** Synchro trop ancienne pour se fier aux compteurs. */
  stale: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [running, setRunning] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const [confirming, setConfirming] = useState<ActionDestructive | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fermeture du menu : clic hors, Échap ; le focus revient sur le bouton.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !menuButton.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  /** Lance une action, affiche son résultat, recharge la page. */
  function run(key: string, task: () => Promise<{ error?: string | null; summary?: string } | undefined | null>, okText?: string) {
    setMenuOpen(false);
    setNotice(null);
    setRunning(key);
    start(async () => {
      try {
        const res = await task();
        if (res?.error) setNotice({ kind: "err", text: res.error });
        else setNotice({ kind: "ok", text: res?.summary ?? okText ?? "Terminé." });
      } finally {
        setRunning(null);
        router.refresh();
      }
    });
  }

  const busy = pending;
  const spinner = <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />;

  function openMenu() {
    const r = menuButton.current?.getBoundingClientRect();
    if (r) setAnchor({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    setMenuOpen((o) => !o);
  }

  function confirmDestructive() {
    if (!confirming) return;
    setDialogError(null);
    const action = confirming;
    start(async () => {
      if (action === "delete") {
        const res = await deleteRouter(routerId);
        if (res?.error) return setDialogError(res.error);
        router.push("/admin/router");
        router.refresh();
        return;
      }
      if (action === "reinstall") {
        const res = await reinstallMikhmonContainer(routerId);
        if (res?.error) return setDialogError(res.error);
        setConfirming(null);
        setNotice({ kind: "ok", text: res?.summary ?? "Réinstallation de MikHmon lancée." });
        router.refresh();
      }
    });
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        {/* Passif et discret : la fraîcheur d'abord, le bouton qui la rafraîchit à côté. */}
        <span
          className={`hidden text-xs sm:inline ${stale ? "font-semibold text-warn" : "text-ink-soft"}`}
          aria-live="polite"
        >
          Synchro {syncedLabel}
        </span>
        <button
          type="button"
          disabled={busy}
          aria-label={`Actualiser les compteurs (synchro ${syncedLabel})`}
          onClick={() => run("refresh", () => refreshRouterStats(routerId), "Compteurs actualisés.")}
          className={GHOST}
        >
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${running === "refresh" ? "animate-spin" : ""}`} />
          <span className="sr-only sm:not-sr-only">Actualiser</span>
        </button>

        <Link href="/admin/settings/router-setup" className={SECONDARY}>
          <Pencil aria-hidden="true" className="h-4 w-4" />
          Modifier
        </Link>

        <button
          ref={menuButton}
          type="button"
          disabled={busy}
          onClick={openMenu}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls="router-maintenance-menu"
          className={SECONDARY}
        >
          <Wrench aria-hidden="true" className="h-4 w-4" />
          Maintenance
          <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
        </button>

        <button
          type="button"
          disabled={busy}
          title="Mesure le débit descendant réel du WAN (téléchargement de test ~40 Mo, jusqu'à 1 min)"
          onClick={() => run("speed", () => speedTestRouter(routerId), "Test de débit terminé.")}
          className={PRIMARY}
        >
          {running === "speed" ? spinner : <Activity aria-hidden="true" className="h-4 w-4" />}
          {running === "speed" ? "Test en cours…" : "Tester le débit"}
        </button>

        {/* Zone destructive : isolée par un filet, jamais voisine d'un geste bénin. */}
        <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-line sm:block" />
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setDialogError(null);
            setConfirming("delete");
          }}
          className={`${DANGER} sm:ml-0 ml-auto`}
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          Supprimer
        </button>
      </div>

      {notice && (
        <p
          role={notice.kind === "err" ? "alert" : "status"}
          className={`max-w-xl text-xs font-medium ${notice.kind === "err" ? "text-err" : "text-ok"}`}
        >
          {notice.text}
        </p>
      )}

      {menuOpen && anchor && createPortal(
        <div
          ref={menuRef}
          id="router-maintenance-menu"
          role="menu"
          aria-label="Actions de maintenance"
          className="fixed z-50 w-72 overflow-hidden rounded-xl border border-line bg-paper py-1 shadow-xl"
          style={{ top: anchor.top, right: anchor.right }}
        >
          <MenuItem
            icon={LayoutTemplate}
            label="Reposer le portail captif"
            hint="Réécrit les fichiers du portail — fait redescendre les prix corrigés dans Forfaits."
            onClick={() =>
              run(
                "repose",
                async () => {
                  const r = await reposerPortailRouteur(routerId);
                  if ("error" in r && r.error) return { error: r.error };
                  const nom = "portail" in r ? r.portail : "captif";
                  return { summary: `Portail « ${nom} » reposé — les prix suivent la page Forfaits.` };
                },
              )
            }
          />
          <MenuItem
            icon={Gauge}
            label="Optimiser le WiFi"
            hint="SSID unifié (band steering), 5 GHz en 80 MHz, 2,4 GHz en 20 MHz."
            onClick={() => run("wifi", () => optimizeRouterWifi(routerId), "WiFi optimisé.")}
          />
          <MenuItem
            icon={Zap}
            label="Optimiser le débit"
            hint="Fasttrack sur les connexions établies, sans casser le filtrage."
            onClick={() => run("tune", () => optimizeRouterThroughput(routerId), "Débit optimisé.")}
          />
          <div role="separator" className="my-1 border-t border-line-soft" />
          <MenuItem
            icon={PackageOpen}
            label="Réinstaller MikHmon"
            hint="Supprime et recrée le conteneur (1 à 3 min). Demande confirmation."
            danger
            onClick={() => {
              setMenuOpen(false);
              setDialogError(null);
              setConfirming("reinstall");
            }}
          />
        </div>,
        document.body,
      )}

      {confirming && (
        <RouterDangerDialog
          action={confirming}
          routerName={routerName}
          pending={pending}
          error={dialogError}
          onConfirm={confirmDestructive}
          onClose={() => {
            setConfirming(null);
            setDialogError(null);
          }}
        />
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  hint,
  danger,
  onClick,
}: {
  icon: typeof Gauge;
  label: string;
  hint: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors ${
        danger ? "text-err hover:bg-err-soft" : "text-ink hover:bg-clay"
      }`}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-5">{label}</span>
        <span className={`block text-[11px] leading-4 ${danger ? "text-err/80" : "text-ink-soft"}`}>{hint}</span>
      </span>
    </button>
  );
}
