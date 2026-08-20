"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Copy,
  ExternalLink,
  Filter,
  Router as RouterIcon,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Wifi,
  X,
} from "lucide-react";
import {
  connectionMethodLabel,
  filterControlCenterRouters,
  getControlCenterMetrics,
  requiresAction,
  requiresVerification,
  routerStatusLabel,
  serviceLabel,
  sortControlCenterRouters,
  type ControlCenterFilters,
  type RemoteAccessControlRouter,
} from "@/lib/remote-access/control-center";
import RemoteAccessTunnelDialog from "./RemoteAccessTunnelDialog";

type Props = {
  routers: RemoteAccessControlRouter[];
  temporaryPassCount: number;
  temporaryPassExpiresAt: string | null;
};

function dateLabel(value: string | null) {
  if (!value) return "Aucune activité connue";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function expiryLabel(value: string | null) {
  if (!value) return "Sans échéance";
  return `Expire le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value))}`;
}

function auditLabel(action: string) {
  const labels: Record<string, string> = {
    credentials_revealed: "Identifiants révélés",
    copied: "Accès copiés",
    link_copied: "Lien copié",
    whatsapp_prepared: "Message WhatsApp préparé",
    replacement_started: "Remplacement démarré",
    replacement_completed: "Remplacement terminé",
  };
  return labels[action] ?? action.replaceAll("_", " ");
}

function statusClasses(router: RemoteAccessControlRouter) {
  if (requiresAction(router)) return "bg-err";
  if (requiresVerification(router)) return "bg-warn";
  if (router.status === "online") return "bg-ok";
  return "bg-line-soft";
}

function priorityMessage(router: RemoteAccessControlRouter) {
  if (requiresAction(router)) {
    return router.replacementStatus === "failed"
      ? "Le remplacement a échoué et requiert une nouvelle intervention."
      : "La configuration du tunnel doit être finalisée avant que le routeur puisse être joint.";
  }
  return "Le routeur est hors ligne : ses accès publics restent enregistrés mais ne répondent pas.";
}

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "ok" | "neutral" | "warn" | "err";
}) {
  const toneClass = {
    ok: "border-ok/30",
    neutral: "border-line",
    warn: "border-warn/40",
    err: "border-err/40",
  }[tone];

  return (
    <article className={`border bg-paper p-4 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink-soft">{hint}</p>
    </article>
  );
}

function RouterStatus({ router }: { router: RemoteAccessControlRouter }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${statusClasses(router)}`} />
      {routerStatusLabel(router.status)}
    </span>
  );
}

function RouterDetail({
  router,
  onClose,
  copiedId,
  onCopy,
  drawer = false,
}: {
  router: RemoteAccessControlRouter;
  onClose?: () => void;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  drawer?: boolean;
}) {
  return (
    <section
      className={drawer ? "h-full overflow-y-auto bg-paper p-5 sm:p-6" : "border border-line bg-paper p-5"}
      aria-label={`Détails du routeur ${router.name}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-deep">Routeur sélectionné</p>
          <h2 className="mt-1 text-xl font-bold text-ink">{router.name}</h2>
          <p className="mt-1 text-xs text-ink-soft">Dernier contact : {dateLabel(router.lastSyncAt)}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="grid min-h-11 min-w-11 place-items-center border border-line text-ink hover:bg-clay"
            aria-label="Fermer les détails"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="mt-4 border border-line-soft bg-clay/50 px-3 py-2.5 rounded-xl">
        <RouterStatus router={router} />
        <p className="mt-1 text-xs text-ink-soft">
          {connectionMethodLabel(router.connectionMethod)}
          {router.ipv6BypassEnabled ? " · Bypass IPv6 actif" : ""}
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-ink">Accès publiés</h3>
        <span className="text-xs tabular-nums text-ink-soft">{router.activeForwards.length} actif{router.activeForwards.length > 1 ? "s" : ""}</span>
      </div>
      {router.activeForwards.length === 0 ? (
        <p className="mt-2 border border-dashed border-line-soft px-3 py-4 text-sm text-ink-soft">
          Aucun accès direct actif pour ce routeur.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line-soft border border-line-soft">
          {router.activeForwards.map((forward) => {
            const opensInBrowser = forward.service === "webfig" || forward.service === "mikhmon";
            return (
              <li key={forward.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{serviceLabel(forward.service)}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">{expiryLabel(forward.expiresAt)}</p>
                  </div>
                  {forward.endpoint && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onCopy(forward.id, forward.endpoint!)}
                        className="grid min-h-9 min-w-9 place-items-center border border-line text-ink hover:bg-clay"
                        aria-label={`Copier l’accès ${serviceLabel(forward.service)}`}
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      {opensInBrowser && (
                        <a
                          href={forward.endpoint}
                          target="_blank"
                          rel="noreferrer"
                          className="grid min-h-9 min-w-9 place-items-center border border-line text-ink hover:bg-clay"
                          aria-label={`Ouvrir ${serviceLabel(forward.service)} dans un nouvel onglet`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
                {forward.endpoint ? (
                  <p className="mt-2 break-all bg-clay px-2 py-1.5 font-mono text-xs text-ink">
                    {copiedId === forward.id ? "Copié dans le presse-papiers" : forward.endpoint}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-ink-soft">Hôte public non configuré.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5 border-t border-line-soft pt-5">
        <h3 className="font-semibold text-ink">Activité récente</h3>
        {router.auditEvents.length === 0 ? (
          <p className="mt-2 text-xs text-ink-soft">Aucun événement d’accès récent.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {router.auditEvents.map((event) => (
              <li key={event.id} className="flex gap-2 text-xs text-ink-soft">
                <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                <span><strong className="font-semibold text-ink">{auditLabel(event.action)}</strong><br />{dateLabel(event.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link
        href={`/admin/remote-access/${router.id}`}
        className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 bg-ink px-4 py-2.5 text-sm font-bold text-white hover:bg-ink/90"
      >
        Ouvrir l’espace routeur <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

export default function RemoteAccessControlCenter({
  routers,
  temporaryPassCount,
  temporaryPassExpiresAt,
}: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ControlCenterFilters["status"]>("all");
  const [method, setMethod] = useState<ControlCenterFilters["method"]>("all");
  const [incidentOnly, setIncidentOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(routers[0]?.id ?? null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const filteredRouters = useMemo(
    () => filterControlCenterRouters(routers, { query, status, method, incidentOnly }),
    [incidentOnly, method, query, routers, status],
  );
  const metrics = useMemo(() => getControlCenterMetrics(routers), [routers]);
  const priorityRouter = useMemo(
    () => sortControlCenterRouters(routers).find((router) => requiresAction(router) || requiresVerification(router)) ?? null,
    [routers],
  );
  const selectedRouter = filteredRouters.find((router) => router.id === selectedId) ?? filteredRouters[0] ?? null;
  const selectedRouterId = selectedRouter?.id ?? null;
  const hasFilters = Boolean(query || status !== "all" || method !== "all" || incidentOnly);

  useEffect(() => {
    if (!mobileDetailOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileDetailOpen(false);
        if (selectedRouterId) {
          requestAnimationFrame(() => rowRefs.current[selectedRouterId]?.focus());
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileDetailOpen, selectedRouterId]);

  function resetFilters() {
    setQuery("");
    setStatus("all");
    setMethod("all");
    setIncidentOnly(false);
  }

  function closeMobileDetail() {
    setMobileDetailOpen(false);
    if (selectedRouter) {
      requestAnimationFrame(() => rowRefs.current[selectedRouter.id]?.focus());
    }
  }

  async function copyEndpoint(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => current === id ? null : current), 1500);
    } catch {
      setCopiedId(null);
    }
  }

  function selectRouter(id: string, openMobileDetail = false) {
    setSelectedId(id);
    if (openMobileDetail) setMobileDetailOpen(true);
  }

  return (
    <div className="animate-fade-in-up">
      <header className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-deep">
            <Wifi className="h-4 w-4" aria-hidden="true" /> Centre de contrôle
          </div>
          <h1 className="text-2xl font-bold text-ink">Accès distant</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-soft">
            Surveillez les tunnels et les accès sécurisés de votre parc MikroTik sans perdre le contexte d’un routeur.
          </p>
        </div>
        <RemoteAccessTunnelDialog />
      </header>

      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicateurs du parc">
        <MetricCard label="Routeurs en ligne" value={`${metrics.onlineCount} / ${metrics.routerCount}`} hint="Disponibilité actuellement confirmée" tone="ok" />
        <MetricCard label="Accès actifs" value={String(metrics.activeAccessCount)} hint="Endpoints publics non révoqués" tone="neutral" />
        <MetricCard label="À vérifier" value={String(metrics.verificationCount)} hint="Routeurs hors ligne ou injoignables" tone="warn" />
        <MetricCard label="Actions requises" value={String(metrics.actionRequiredCount)} hint="Configuration ou remplacement en attente" tone="err" />
      </section>

      {priorityRouter && (
        <section className="mt-5 flex flex-col gap-3 border border-warn/40 bg-brand/10 p-4 sm:flex-row sm:items-center" aria-label="Action prioritaire">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warn" aria-hidden="true" />
          <div className="min-w-0 flex-1"><p className="font-semibold text-ink">{priorityRouter.name} demande votre attention</p><p className="mt-0.5 text-sm text-ink-soft">{priorityMessage(priorityRouter)}</p></div>
          <button type="button" onClick={() => setIncidentOnly(true)} className="min-h-11 border border-line bg-paper px-3 py-2 text-sm font-bold text-ink hover:bg-clay rounded-xl">Voir les incidents</button>
        </section>
      )}

      {temporaryPassCount > 0 && (
        <section className="mt-5 flex items-start gap-3 border border-ok/40 bg-green-50 px-4 py-3 text-sm text-ink">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
          <p><strong>{temporaryPassCount} pass temporaire{temporaryPassCount > 1 ? "s" : ""} actif{temporaryPassCount > 1 ? "s" : ""}</strong><br /><span className="text-ink-soft">Accès gratuit {temporaryPassExpiresAt ? `jusqu’au ${dateLabel(temporaryPassExpiresAt)}` : "en cours"}.</span></p>
        </section>
      )}

      <section className="mt-8" aria-labelledby="fleet-heading">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><h2 id="fleet-heading" className="text-xl font-bold text-ink">Vos routeurs</h2><p className="mt-1 text-sm text-ink-soft">Sélectionnez une ligne pour examiner ses accès sans quitter cette vue.</p></div><span className="font-mono text-xs text-ink-soft">{filteredRouters.length} affiché{filteredRouters.length > 1 ? "s" : ""}</span></div>

        <div className="mt-4 grid gap-3 border border-line bg-paper p-3 lg:grid-cols-[minmax(0,1fr)_160px_160px_auto_auto] rounded-xl">
          <label className="relative block"><span className="sr-only">Rechercher un routeur, un accès ou un endpoint</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Rechercher un routeur, un accès ou un endpoint" className="min-h-11 w-full border border-line bg-paper py-2 pl-10 pr-3 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink rounded-lg" /></label>
          <label><span className="sr-only">Filtrer par état</span><select value={status} onChange={(event) => setStatus(event.target.value as ControlCenterFilters["status"])} className="min-h-11 w-full border border-line bg-paper px-3 text-sm text-ink rounded-lg"><option value="all">Tous les états</option><option value="online">En ligne</option><option value="attention">À vérifier</option></select></label>
          <label><span className="sr-only">Filtrer par tunnel</span><select value={method} onChange={(event) => setMethod(event.target.value as ControlCenterFilters["method"])} className="min-h-11 w-full border border-line bg-paper px-3 text-sm text-ink rounded-lg"><option value="all">Tous les tunnels</option><option value="wireguard">WireGuard</option><option value="openvpn">OpenVPN</option><option value="direct">Sans tunnel</option></select></label>
          <button type="button" aria-pressed={incidentOnly} onClick={() => setIncidentOnly((value) => !value)} className={`inline-flex min-h-11 items-center justify-center gap-2 border px-3 text-sm font-bold ${incidentOnly ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink hover:bg-clay"}`}><Filter className="h-4 w-4" aria-hidden="true" /> Incidents</button>
          {hasFilters && <button type="button" onClick={resetFilters} className="inline-flex min-h-11 items-center justify-center gap-2 border border-line bg-paper px-3 text-sm font-bold text-ink hover:bg-clay rounded-xl"><SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Effacer</button>}
        </div>

        {routers.length === 0 ? (
          <div className="mt-4 border border-dashed border-line bg-paper px-6 py-14 text-center"><RouterIcon className="mx-auto h-8 w-8 text-ink-soft" aria-hidden="true" /><p className="mt-3 font-semibold text-ink">Aucun routeur configuré</p><p className="mt-1 text-sm text-ink-soft">Installez un tunnel pour connecter votre premier MikroTik.</p><div className="mt-5"><RemoteAccessTunnelDialog /></div></div>
        ) : filteredRouters.length === 0 ? (
          <div className="mt-4 border border-dashed border-line bg-paper px-6 py-14 text-center"><Search className="mx-auto h-8 w-8 text-ink-soft" aria-hidden="true" /><p className="mt-3 font-semibold text-ink">Aucun routeur ne correspond à ces filtres</p><button type="button" onClick={resetFilters} className="mt-4 min-h-11 border border-line bg-paper px-3 text-sm font-bold text-ink hover:bg-clay rounded-xl">Effacer les filtres</button></div>
        ) : (
          <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <div className="hidden overflow-hidden border border-line bg-paper xl:block"><table className="w-full text-left text-sm"><thead className="border-b border-line bg-clay"><tr className="font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-soft"><th scope="col" className="px-4 py-3">Routeur</th><th scope="col" className="px-4 py-3">Tunnel</th><th scope="col" className="px-4 py-3">Accès</th><th scope="col" className="px-4 py-3">État</th><th scope="col" className="px-4 py-3"><span className="sr-only">Espace routeur</span></th></tr></thead><tbody>{filteredRouters.map((router) => <tr key={router.id} className={selectedRouter?.id === router.id ? "border-b border-line-soft bg-brand/10 last:border-0" : "border-b border-line-soft last:border-0 hover:bg-clay/50"}><td className="p-0"><button ref={(element) => { rowRefs.current[router.id] = element; }} type="button" onClick={() => selectRouter(router.id)} aria-current={selectedRouter?.id === router.id ? "true" : undefined} className="w-full px-4 py-3 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"><span className="font-bold text-ink">{router.name}</span><span className="mt-1 block text-xs text-ink-soft">Dernier contact : {dateLabel(router.lastSyncAt)}</span></button></td><td className="px-4 py-3"><span className="inline-flex border border-line-soft bg-paper px-2 py-1 text-xs font-semibold text-ink rounded-xl">{connectionMethodLabel(router.connectionMethod)}</span></td><td className="px-4 py-3 tabular-nums text-ink">{router.activeForwards.length} actif{router.activeForwards.length > 1 ? "s" : ""}</td><td className="px-4 py-3"><RouterStatus router={router} /></td><td className="px-4 py-3 text-right"><Link href={`/admin/remote-access/${router.id}`} className="inline-flex min-h-9 items-center gap-1 border border-line px-2.5 text-xs font-bold text-ink hover:bg-clay rounded-xl">Gérer <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></td></tr>)}</tbody></table></div>
              <ul className="space-y-3 xl:hidden">{filteredRouters.map((router) => <li key={router.id} className={selectedRouter?.id === router.id ? "border border-brand bg-brand/10" : "border border-line bg-paper"}><button ref={(element) => { rowRefs.current[router.id] = element; }} type="button" onClick={() => selectRouter(router.id, true)} aria-current={selectedRouter?.id === router.id ? "true" : undefined} className="w-full p-4 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"><span className="flex items-start justify-between gap-4"><span><span className="block font-bold text-ink">{router.name}</span><span className="mt-1 block text-xs text-ink-soft">{connectionMethodLabel(router.connectionMethod)} · {router.activeForwards.length} accès actif{router.activeForwards.length > 1 ? "s" : ""}</span></span><RouterStatus router={router} /></span></button><div className="border-t border-line-soft px-4 py-3"><Link href={`/admin/remote-access/${router.id}`} className="inline-flex min-h-9 items-center gap-1 text-xs font-bold text-ink hover:text-brand-deep">Ouvrir l’espace routeur <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></div></li>)}</ul>
            </div>
            {selectedRouter && <div className="hidden xl:block"><div className="sticky top-4"><RouterDetail router={selectedRouter} copiedId={copiedId} onCopy={copyEndpoint} /></div></div>}
          </div>
        )}
      </section>

      {mobileDetailOpen && selectedRouter && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/50 xl:hidden" role="dialog" aria-modal="true" aria-label={`Détails de ${selectedRouter.name}`}>
          <div className="h-full w-full max-w-xl"><RouterDetail router={selectedRouter} drawer onClose={closeMobileDetail} copiedId={copiedId} onCopy={copyEndpoint} /></div>
        </div>
      )}
    </div>
  );
}
