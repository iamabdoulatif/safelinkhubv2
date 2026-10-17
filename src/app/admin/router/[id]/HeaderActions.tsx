"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ChevronDown,
  X,
  Gauge,
  KeyRound,
  LayoutTemplate,
  Loader2,
  Globe,
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
  reconfigureMikhmonSession,
  getMikhmonAdminCredentials,
  resetMikhmonAdminPassword,
  fixRouterMikhmonLocalAccess,
} from "@/lib/mikrotik/actions";
import { reinstallMikhmonContainer } from "@/lib/mikrotik/container-setup";
import { reposerPortailRouteur } from "@/lib/captive-templates/actions";
import type { ActionDestructive } from "@/lib/mikrotik/action-destructive";
import RouterDangerDialog from "../RouterDangerDialog";
import MikhmonCredentialsDialog from "./MikhmonCredentialsDialog";

/**
 * Barre d'actions de la fiche routeur — quatre niveaux, pas huit boutons.
 *
 *   1. « Tester le débit » : la seule action PRIMAIRE. C'est la question du
 *      quotidien (« le lien tient-il ? ») et elle ne casse rien.
 *   2. « Modifier » (secondaire) et « Maintenance ▾ » : les gestes rares
 *      (reposer le portail, optimiser WiFi/débit) rangés hors de vue, avec la
 *      réinstallation de MikHmon isolée dans les options avancées du panneau.
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
  const [confirming, setConfirming] = useState<ActionDestructive | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [mikhmonOpen, setMikhmonOpen] = useState(false);
  const [mikhmonPassword, setMikhmonPassword] = useState<string | null>(null);
  const [mikhmonLoading, setMikhmonLoading] = useState(false);
  const [mikhmonResetting, setMikhmonResetting] = useState(false);
  const [mikhmonError, setMikhmonError] = useState<string | null>(null);
  const [mikhmonSuccess, setMikhmonSuccess] = useState<string | null>(null);
  const [mikhmonRevealed, setMikhmonRevealed] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const dialog = menuRef.current;
    const trigger = menuButton.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [menuOpen]);

  /** Lance une action, affiche son résultat, recharge la page. */
  function run(key: string, task: () => Promise<{ error?: string | null; summary?: string } | undefined | null>, okText?: string) {
    setNotice(null);
    setRunning(key);
    start(async () => {
      try {
        const res = await task();
        if (res?.error) setNotice({ kind: "err", text: res.error });
        else setNotice({ kind: "ok", text: res?.summary ?? okText ?? "Terminé." });
      } catch {
        setNotice({ kind: "err", text: "L’opération a échoué. Veuillez réessayer." });
      } finally {
        setRunning(null);
        router.refresh();
      }
    });
  }

  const busy = pending;
  const spinner = <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />;

  function openMikhmonCredentials() {
    setMenuOpen(false);
    setMikhmonOpen(true);
    setMikhmonPassword(null);
    setMikhmonError(null);
    setMikhmonSuccess(null);
    setMikhmonRevealed(false);
    setMikhmonLoading(true);
    void getMikhmonAdminCredentials(routerId).then((res) => {
      setMikhmonLoading(false);
      if (res?.error) setMikhmonError(res.error);
      else setMikhmonPassword(res?.password ?? null);
    });
  }

  function resetMikhmonCredentials() {
    setMikhmonError(null);
    setMikhmonSuccess(null);
    setMikhmonResetting(true);
    void resetMikhmonAdminPassword(routerId).then((res) => {
      setMikhmonResetting(false);
      if (res?.error) setMikhmonError(res.error);
      else {
        setMikhmonPassword("1234");
        setMikhmonRevealed(false);
        setMikhmonSuccess(res?.summary ?? "Mot de passe MikHmon restauré à 1234.");
        router.refresh();
      }
    });
  }

  function openMenu() {
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
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          aria-controls="router-maintenance-panel"
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

      {menuOpen && (
        <dialog
          ref={menuRef}
          id="router-maintenance-panel"
          aria-labelledby="maintenance-title"
          onCancel={() => setMenuOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              const rect = event.currentTarget.getBoundingClientRect();
              if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setMenuOpen(false);
            }
          }}
          className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-none border-0 border-l border-line bg-paper p-0 text-ink shadow-modal backdrop:bg-slate-deep/40 sm:w-[440px]"
        >
          <div className="flex h-full flex-col">
            <header className="flex shrink-0 items-start gap-3 border-b border-line bg-paper px-5 py-5 sm:px-6">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-slate-deep"><Wrench className="h-5 w-5" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <h2 id="maintenance-title" className="text-lg font-bold">Maintenance</h2>
                <p className="mt-1 truncate text-sm text-ink-soft">{routerName}</p>
              </div>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Fermer la maintenance" className="rounded-full p-2 text-ink-soft hover:bg-clay focus-visible:outline-2 focus-visible:outline-brand-deep"><X className="h-5 w-5" aria-hidden="true" /></button>
            </header>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-6">
              <p className="mb-6 text-sm leading-6 text-ink-soft">Choisissez une action pour consulter ses détails avant de la lancer.</p>
              <fieldset disabled={busy} className="min-w-0 space-y-6 disabled:opacity-60">
              <section aria-label="Réseau">
                <GroupTitle>Réseau</GroupTitle>
                <div className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line">
                  <MenuItem icon={Gauge} label="Optimiser le Wi-Fi" hint="Unifie le SSID (band steering), règle le 5 GHz en 80 MHz et le 2,4 GHz en 20 MHz." onClick={() => run("wifi", () => optimizeRouterWifi(routerId), "Wi-Fi optimisé.")} />
                  <MenuItem icon={Zap} label="Optimiser le débit" hint="Active Fasttrack sur les connexions établies, sans modifier le filtrage." onClick={() => run("tune", () => optimizeRouterThroughput(routerId), "Débit optimisé.")} />
                </div>
              </section>
              <section aria-label="Portail captif">
                <GroupTitle>Portail captif</GroupTitle>
                <div className="overflow-hidden rounded-xl border border-line">
                  <MenuItem
                    icon={LayoutTemplate}
                    label="Réappliquer le portail"
                    hint="Met à jour le portail captif avec les tarifs actuels de la page Forfaits."
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
                </div>
              </section>
              <section aria-label="MikHmon">
                <GroupTitle>MikHmon</GroupTitle>
                <div className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line">
                  <MenuItem
                    icon={KeyRound}
                    label="Voir les identifiants"
                    hint="Consultez le mot de passe d’administration MikHmon de ce routeur."
                    onClick={openMikhmonCredentials}
                  />
                  <MenuItem
                    icon={Globe}
                    label="Autoriser l’accès local"
                    hint="Permet d’ouvrir MikHmon depuis le Wi-Fi du routeur à l’adresse http://<passerelle>:8087."
                    onClick={() =>
                      run(
                        "mikhmon-local",
                        () => fixRouterMikhmonLocalAccess(routerId),
                        "Accès local MikHmon ouvert.",
                      )
                    }
                  />
                  <MenuItem
                    icon={RefreshCw}
                    label="Restaurer la session"
                    hint="Régénère la configuration MikHmon (suppression accidentelle)."
                    onClick={() =>
                      run(
                        "mikhmon",
                        () => reconfigureMikhmonSession(routerId),
                        "Session MikHmon restaurée.",
                      )
                    }
                  />
                </div>
              </section>
              <details className="group border-t border-line pt-4">
                <summary className="flex cursor-pointer list-none items-center justify-between py-2 text-xs font-bold uppercase tracking-wider text-ink-soft">Options avancées<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
                <div className="mt-3 overflow-hidden rounded-xl border border-err/30">
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
                </div>
              </details>
              </fieldset>
            </div>
            <footer className="shrink-0 border-t border-line bg-clay/40 px-5 py-4 sm:px-6" aria-live="polite">
              {busy ? <p role="status" className="flex items-center gap-2 text-sm font-semibold text-ink">{spinner} Opération en cours…</p> : notice ? <p role={notice.kind === "err" ? "alert" : "status"} className={`text-sm font-medium ${notice.kind === "err" ? "text-err" : "text-ok"}`}>{notice.text}</p> : <p className="text-xs leading-5 text-ink-soft">Les actions s’appliquent uniquement à ce routeur.</p>}
            </footer>
          </div>
        </dialog>
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

      {mikhmonOpen && (
        <MikhmonCredentialsDialog
          routerName={routerName}
          password={mikhmonPassword}
          loading={mikhmonLoading}
          resetting={mikhmonResetting}
          error={mikhmonError}
          success={mikhmonSuccess}
          revealed={mikhmonRevealed}
          onReveal={() => setMikhmonRevealed((value) => !value)}
          onReset={resetMikhmonCredentials}
          onClose={() => {
            if (!mikhmonResetting) setMikhmonOpen(false);
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
    <details className="group/action">
      <summary className={`flex cursor-pointer list-none items-center gap-3 px-4 py-4 transition-colors focus-visible:outline-2 focus-visible:outline-brand-deep ${danger ? "text-err hover:bg-err-soft" : "text-ink hover:bg-clay"}`}>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${danger ? "bg-err-soft" : "bg-clay text-brand-deep"}`}><Icon aria-hidden="true" className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1 text-sm font-semibold">{label}</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open/action:rotate-180" />
      </summary>
      <div className="px-4 pb-4 pl-16">
        <p className="text-sm leading-6 text-ink-soft">{hint}</p>
        <button type="button" onClick={onClick} className={`mt-3 ${danger ? DANGER : PRIMARY}`}>{danger ? "Continuer vers la confirmation" : label}</button>
      </div>
    </details>
  );
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-ink-soft">{children}</h3>;
}
