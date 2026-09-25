"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Copy,
  CreditCard,
  ExternalLink,
  Globe2,
  Loader2,
  Monitor,
  ShieldAlert,
  SquareTerminal,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { disablePortForward, enablePortForward } from "@/lib/mikrotik/port-forward";
import { PERIOD_PRICE_CENTS, type BillingPeriod } from "@/lib/mikrotik/billing-plans";
import { VPN_TRIAL_DAYS } from "@/lib/billing/auto-setup-pricing";
import { getRouterResources, type RouterResources } from "@/lib/mikrotik/router-resources";
import { isWebAccessService } from "@/lib/mikrotik/remote-access-host";
import RemoteAccessPaywallModal from "./RemoteAccessPaywallModal";
import TrialBadge from "@/components/billing/TrialBadge";

type RouterRow = {
  id: string;
  name: string;
  status: string;
  connectionMethod: string;
  tunnelIp: string | null;
  username: string | null;
  // Per-router relay host (shard-aware, computed server-side). Falls back to
  // the section-wide relayHost when absent (legacy / sharding disabled).
  relayHost?: string;
};

type AccessPlan = BillingPeriod | "__unlimited__" | "__quota__";

type AccessConfirmation =
  | { kind: "enable"; service: string; plan: BillingPeriod }
  | { kind: "disable"; forwardId: string; service: string }
  | { kind: "enable-all"; services: string[] }
  | null;

export type ForwardRow = {
  id: string;
  routerId: string;
  service: string;
  publicPort: number;
  billingPeriod: string;
  expiresAt: Date | null;
  cloudDomain?: string | null;
};

const SERVICE_LABELS: Record<string, string> = {
  winbox: "WinBox",
  webfig: "WebFig (navigateur)",
  ssh: "SSH (SFTP — FileZilla, etc.)",
  mikhmon: "MikHmon (vouchers)",
};

/** Ce que l'on fait avec chaque accès — lu d'un coup d'œil, avant le nom technique. */
const SERVICE_META: Record<string, { icon: LucideIcon; hint: string }> = {
  winbox: { icon: Monitor, hint: "Application WinBox" },
  webfig: { icon: Globe2, hint: "Dans le navigateur" },
  ssh: { icon: SquareTerminal, hint: "Terminal ou FileZilla (SFTP)" },
  mikhmon: { icon: Ticket, hint: "Gestion des vouchers" },
};

const BILLING_PERIOD_LABELS: Record<BillingPeriod, string> = {
  monthly: "1 mois",
  quarterly: "3 mois",
  semiannual: "6 mois",
  yearly: "12 mois",
};

function formatExpiry(date: Date | null) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatFcfa(cents: number) {
  return `${cents.toLocaleString("fr-FR")} FCFA`;
}

function CopyableAddress({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex h-8 min-w-0 max-w-full items-center gap-2 rounded-lg border border-line bg-clay/60 px-2.5 font-mono text-xs text-ink hover:border-line-strong"
      aria-label={`Copier ${value}`}
    >
      <span className="truncate">{value}</span>
      {copied ? (
        <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ok" />
      ) : (
        <Copy aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
      )}
      <span className="sr-only" aria-live="polite">{copied ? "Copié" : ""}</span>
    </button>
  );
}

function serviceUrl(service: string, address: string, username: string | null) {
  if (service === "webfig" || service === "mikhmon") return `http://${address}`;
  // sftp://user@host:port — the OS, not this page, decides which installed
  // app actually opens this link. Until FileZilla is set as the default
  // handler for the sftp:// scheme (see SshFileZillaTutorial below), the OS
  // may hand it to any other app that also registered for it.
  if (service === "ssh") {
    const [host, port] = address.split(":");
    return `sftp://${username ? `${encodeURIComponent(username)}@` : ""}${host}:${port}`;
  }
  return address;
}

function forwardAddress(
  forward: ForwardRow,
  relayHost: string,
  relayBaseDomain: string | null,
) {
  if (forward.service === "mikhmon" && forward.cloudDomain) {
    return `https://${forward.cloudDomain}`;
  }
  return relayBaseDomain && isWebAccessService(forward.service)
    ? `https://${relayHost}:${forward.publicPort}`
    : `${relayHost}:${forward.publicPort}`;
}

type Os = "mac" | "windows" | "other";

function detectOs(): Os {
  if (typeof navigator === "undefined") return "other";
  const platform = `${navigator.userAgent} ${navigator.platform ?? ""}`.toLowerCase();
  if (platform.includes("mac")) return "mac";
  if (platform.includes("win")) return "windows";
  return "other";
}

function SshFileZillaTutorial({
  address,
  username,
}: {
  address: string;
  username: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [os, setOs] = useState<Os>("other");
  const [host, port] = address.split(":");

  // detectOs() reads navigator.userAgent, which doesn't exist during SSR;
  // this must stay client-only-after-mount — a lazy useState initializer
  // would run during the server render of this "use client" component and
  // crash.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOs(detectOs());
  }, []);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs font-medium text-brand-deep hover:underline"
      >
        Configurer FileZilla
        <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-line-soft bg-clay/40 px-3 py-2.5 text-xs text-ink-soft">
          <p className="font-medium text-ink">
            Étape 1 (une seule fois par ordinateur) — faire de FileZilla le gestionnaire par
            défaut du lien <code className="rounded bg-clay px-1">sftp://</code>
          </p>
          <p className="mt-1 text-ink-soft">
            Le bouton <ExternalLink className="inline h-3 w-3" /> ci-dessus ouvre un lien{" "}
            <code className="rounded bg-clay px-1">sftp://</code> — c&apos;est{" "}
            {os === "windows" ? "Windows" : "le système (macOS Launch Services ou équivalent)"},
            pas FileZilla ni ce site, qui décide quelle app reçoit ce lien. Si une autre app (VLC,
            par exemple) s&apos;est enregistrée pour ce type de lien, faites ceci{" "}
            <span className="font-medium">une seule fois</span> pour que ce soit FileZilla à
            partir de maintenant :
          </p>

          {os === "windows" ? (
            <>
              <p className="mt-1.5 text-ink-soft">
                Ouvrez PowerShell et lancez (ajustez le chemin si FileZilla n&apos;est pas
                installé dans <code className="rounded bg-clay px-1">Program Files</code>) :
              </p>
              <pre className="mt-1.5 code-block px-3 py-2 text-xs">
                {`reg add "HKCU\\Software\\Classes\\sftp" /ve /d "URL:SFTP Protocol" /f
reg add "HKCU\\Software\\Classes\\sftp" /v "URL Protocol" /d "" /f
reg add "HKCU\\Software\\Classes\\sftp\\shell\\open\\command" /ve /d "\\"C:\\Program Files\\FileZilla FTP Client\\filezilla.exe\\" \\"%1\\"" /f`}
              </pre>
              <p className="mt-1 text-ink-soft">
                Fermez et rouvrez le navigateur après la commande. Vous pouvez vérifier le chemin
                exact de <code className="rounded bg-clay px-1">filezilla.exe</code> via un
                clic droit sur son raccourci → Propriétés.
              </p>
            </>
          ) : (
            <>
              <p className="mt-1.5 text-ink-soft">Dans le Terminal :</p>
              <pre className="mt-1.5 code-block px-3 py-2 text-xs">
                brew install duti{"\n"}duti -s org.filezilla-project.filezilla sftp all
              </pre>
              <p className="mt-1 text-ink-soft">
                (Sans Homebrew : installez-le d&apos;abord avec{" "}
                <code className="rounded bg-clay px-1">
                  /bin/bash -c &quot;$(curl -fsSL
                  https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)&quot;
                </code>
                .)
              </p>
            </>
          )}
          <p className="mt-1 text-ink-soft">
            Une fois fait, le bouton ci-dessus ouvrira directement FileZilla, hôte/port/
            utilisateur déjà pré-remplis.
          </p>

          <p className="mt-2 font-medium text-ink">
            Étape 2 — si vous préférez configurer à la main (Gestionnaire de sites)
          </p>
          <ol className="mt-1 list-decimal space-y-1 pl-4">
            <li>Fichier → Gestionnaire de sites → Nouveau site</li>
            <li>
              Protocole : <span className="font-medium">SFTP - SSH File Transfer Protocol</span>{" "}
              (pas FTP — c&apos;est l&apos;erreur la plus fréquente)
            </li>
            <li>
              Hôte : <span className="font-medium">{host}</span> — Port :{" "}
              <span className="font-medium">{port}</span>
            </li>
            <li>
              Authentification : Normal — Utilisateur :{" "}
              <span className="font-medium">{username || "(identifiant du routeur)"}</span> — Mot
              de passe : celui du routeur
            </li>
            <li>Connexion</li>
          </ol>
          <p className="mt-1.5 text-warn">
            Avec la barre Quickconnect plutôt que le Gestionnaire de sites, préfixez l&apos;hôte
            avec <code className="rounded bg-clay px-1">sftp://</code>, sinon FileZilla tente
            du FTP classique et la connexion échoue.
          </p>
        </div>
      )}
    </div>
  );
}

function RouterDirectAccess({
  router,
  forwards,
  relayHost,
  relayBaseDomain,
  unlimited,
  quotaExpiresAt,
  showName,
}: {
  router: RouterRow;
  forwards: ForwardRow[];
  relayHost: string;
  relayBaseDomain: string | null;
  unlimited: boolean;
  quotaExpiresAt: Date | null;
  /** Nom du routeur au-dessus de la liste — seulement s'il y en a plusieurs. */
  showName: boolean;
}) {
  const navRouter = useRouter();
  const [pendingService, setPendingService] = useState<string | null>(null);
  // TEMPORAIRE — porte de monétisation manuelle des accès distants : ouvre un
  // paywall quand le serveur refuse l'activation (needsAuthorization).
  // TODO: Remplacer par système de paiement intégré.
  const [paywall, setPaywall] = useState<{ service: string; period: BillingPeriod } | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resources, setResources] = useState<RouterResources | null>(null);
  const [confirmation, setConfirmation] = useState<AccessConfirmation>(null);
  const confirmationTriggerRef = useRef<HTMLElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  // Plan chosen per service before activating it — defaults to monthly.
  // Billing isn't enforced yet (see port-forward.ts), but the choice is
  // still recorded so the UI already reflects what a real subscription
  // would look like once payment goes live.
  // "__unlimited__" is a UI-only sentinel for superadmin: the server already
  // ignores billingPeriod and sets expiresAt=null for unlimited accounts.
  const [selectedPlans, setSelectedPlans] = useState<Record<string, AccessPlan>>({});

  const defaultPlan = (service: string): AccessPlan => {
    if (quotaExpiresAt) return "__quota__";
    return selectedPlans[service] ?? (unlimited ? "__unlimited__" : "monthly");
  };

  const activeServices = new Set(forwards.map((f) => f.service));
  const hasActiveAccess = activeServices.size > 0;
  const resourcesLoading = hasActiveAccess && resources === null;
  const summary = resources?.accessSummary;

  // Re-fetched on every mount (i.e. every page refresh, and right after a
  // toggle triggers navRouter.refresh()) so an enabled access never goes
  // unnoticed — same idea as WinBox's own Neighbors list, but for routers
  // reachable through the relay rather than local broadcast discovery.
  useEffect(() => {
    if (!hasActiveAccess) return;
    let cancelled = false;
    getRouterResources(router.id).then((res) => {
      if (cancelled) return;
      if (res?.success) setResources(res.resources);
    });
    return () => {
      cancelled = true;
    };
  }, [hasActiveAccess, router.id]);

  function closeConfirmation() {
    setConfirmation(null);
    requestAnimationFrame(() => confirmationTriggerRef.current?.focus());
  }

  function requestEnable(service: string, trigger: HTMLElement) {
    const raw = defaultPlan(service);
    const plan: BillingPeriod = raw === "__unlimited__" || raw === "__quota__" ? "monthly" : raw;
    confirmationTriggerRef.current = trigger;
    setConfirmation({ kind: "enable", service, plan });
  }

  function requestDisable(forwardId: string, service: string, trigger: HTMLElement) {
    confirmationTriggerRef.current = trigger;
    setConfirmation({ kind: "disable", forwardId, service });
  }

  function requestEnableAll(trigger: HTMLElement) {
    const inactive = ALL_SERVICES.filter((service) => !activeServices.has(service));
    if (inactive.length === 0) return;
    confirmationTriggerRef.current = trigger;
    setConfirmation({ kind: "enable-all", services: inactive });
  }

  function runEnable(service: string, plan: BillingPeriod) {
    setPendingService(service);
    setError(null);
    startTransition(async () => {
      const res = await enablePortForward(router.id, service, plan);
      setPendingService(null);
      // Accès distant payant : ouvrir le paywall au lieu d'afficher l'erreur.
      if (res && "needsAuthorization" in res && res.needsAuthorization) {
        setPaywall({ service, period: plan });
        return;
      }
      if (res?.error) setError(res.error);
      else navRouter.refresh();
    });
  }

  function runDisable(forwardId: string, service: string) {
    setPendingService(service);
    setError(null);
    startTransition(async () => {
      const res = await disablePortForward(forwardId);
      setPendingService(null);
      if (res?.error) setError(res.error);
      else navRouter.refresh();
    });
  }

  const ALL_SERVICES = ["winbox", "webfig", "ssh", "mikhmon"] as const;

  function runEnableAll() {
    setError(null);
    const inactive = ALL_SERVICES.filter((s) => !activeServices.has(s));
    if (inactive.length === 0) return;
    startTransition(async () => {
      let failed = false;
      for (const service of inactive) {
        setPendingService(service);
        const res = await enablePortForward(router.id, service, quotaExpiresAt ? "monthly" : "yearly");
        if (res && "needsAuthorization" in res && res.needsAuthorization) {
          // Payant : on ouvre le paywall pour ce service et on s'arrête.
          setPaywall({ service, period: "yearly" });
          failed = true;
          break;
        }
        if (res?.error) {
          setError(res.error);
          failed = true;
          break;
        }
      }
      setPendingService(null);
      if (!failed) navRouter.refresh();
    });
  }

  function confirmAccessChange() {
    const action = confirmation;
    if (!action) return;
    setConfirmation(null);

    if (action.kind === "enable") {
      runEnable(action.service, action.plan);
      return;
    }
    if (action.kind === "disable") {
      runDisable(action.forwardId, action.service);
      return;
    }
    runEnableAll();
  }

  useEffect(() => {
    if (!confirmation) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeConfirmation();
    };
    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => confirmButtonRef.current?.focus());
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmation]);

  const details = [
    ["IP WAN", summary?.wanIpAddress || "—"],
    ["MAC WAN", summary?.wanMacAddress || "—"],
    ["IP tunnel", summary?.tunnelIp || router.tunnelIp || "—"],
    ["Identity", summary?.identity ?? resources?.identity ?? router.name],
    ["RouterOS", resources?.version ?? "—"],
    ["Carte", resources?.boardName ?? "—"],
    ["Uptime", resources?.uptime ?? "—"],
  ] as const;

  return (
    <div>
      <div className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-x-2 text-sm text-ink-soft">
            {showName && <span className="font-semibold text-ink">{router.name}</span>}
            <span>
              <span className="font-semibold tabular-nums text-ink">{activeServices.size}</span> sur{" "}
              {ALL_SERVICES.length} services ouverts
            </span>
            {router.status !== "online" && <span>· routeur hors ligne, activation impossible</span>}
          </span>
          {unlimited && activeServices.size < 4 && (
            <button
              type="button"
              disabled={pending}
              onClick={(event) => requestEnableAll(event.currentTarget)}
              className="btn btn-sm btn-outline inline-flex items-center gap-1.5"
            >
              {pending && pendingService && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
              {pending
                ? pendingService
                  ? `${SERVICE_LABELS[pendingService] ?? pendingService}…`
                  : "Activation…"
                : `Tout activer (${4 - activeServices.size})`}
            </button>
          )}
        </div>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-err-soft px-3 py-2 text-sm text-err">
          {error}
        </p>
      )}

      {/* Une ligne par service : ce qu'il sert à faire, son adresse quand il
          est ouvert, et l'interrupteur. L'ancienne grille qui répétait les
          mêmes adresses sous la liste a disparu. */}
      <ul role="list" className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line">
        {ALL_SERVICES.map((service) => {
          const forward = forwards.find((f) => f.service === service);
          const isPublic = Boolean(forward);
          const busy = pending && pendingService === service;
          const expiry = formatExpiry(forward?.expiresAt ?? null);
          const planLabel = forward
            ? forward.billingPeriod === "free_until"
              ? `Gratuit jusqu'au ${formatExpiry(forward.expiresAt) ?? "quota"}`
              : BILLING_PERIOD_LABELS[(forward.billingPeriod as BillingPeriod) ?? "monthly"]
            : null;
          const { icon: Icon, hint } = SERVICE_META[service];
          // Services web servis en HTTPS par le nginx du relais (certificat
          // joker) ; WinBox/SSH gardent leur hôte:port brut.
          const address = forward ? forwardAddress(forward, relayHost, relayBaseDomain) : null;
          const direct =
            forward && ((service === "mikhmon" && Boolean(forward.cloudDomain)) ||
              (Boolean(relayBaseDomain) && isWebAccessService(service)));
          const url = forward && address ? (direct ? address : serviceUrl(service, address, router.username)) : null;
          const openable = service === "webfig" || service === "mikhmon" || service === "ssh";
          return (
            <li key={service} className={`flex gap-3.5 px-4 py-4 sm:px-5 ${isPublic ? "bg-paper" : "bg-clay/30"}`}>
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  isPublic ? "bg-slate-deep text-brand" : "border border-line bg-paper text-ink-soft"
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{SERVICE_LABELS[service].split(" (")[0]}</p>
                    <p className="text-xs text-ink-soft">{hint}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    {!isPublic && (
                      <select
                        value={defaultPlan(service)}
                        onChange={(e) =>
                          setSelectedPlans((prev) => ({
                            ...prev,
                            [service]: e.target.value as AccessPlan,
                          }))
                        }
                        disabled={busy}
                        aria-label={`Durée de l'accès ${SERVICE_LABELS[service]}`}
                        className="field h-8 w-auto py-0 text-xs"
                      >
                        {quotaExpiresAt ? (
                          <option value="__quota__">Gratuit jusqu&apos;au {formatExpiry(quotaExpiresAt)}</option>
                        ) : (
                          <>
                            <option value="monthly">1 mois — {formatFcfa(PERIOD_PRICE_CENTS.monthly)}</option>
                            <option value="quarterly">3 mois — {formatFcfa(PERIOD_PRICE_CENTS.quarterly)}</option>
                            <option value="semiannual">6 mois — {formatFcfa(PERIOD_PRICE_CENTS.semiannual)}</option>
                            <option value="yearly">12 mois — {formatFcfa(PERIOD_PRICE_CENTS.yearly)}</option>
                          </>
                        )}
                        {unlimited && <option value="__unlimited__">Forfait illimité</option>}
                      </select>
                    )}
                    <span className="flex items-center gap-2">
                      <span className={`w-12 text-right text-xs font-medium ${isPublic ? "text-ink" : "text-ink-soft"}`}>
                        {busy ? <Loader2 aria-hidden="true" className="ml-auto h-3.5 w-3.5 animate-spin" /> : isPublic ? "Public" : "Privé"}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isPublic}
                        aria-label={`Accès public ${SERVICE_LABELS[service]}`}
                        disabled={busy || (!isPublic && router.status !== "online" && !unlimited)}
                        onClick={(event) =>
                          isPublic
                            ? requestDisable(forward!.id, service, event.currentTarget)
                            : requestEnable(service, event.currentTarget)
                        }
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                          isPublic ? "bg-slate-deep" : "bg-line-strong/60"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`inline-block h-4.5 w-4.5 transform rounded-full bg-paper shadow transition-transform ${
                            isPublic ? "translate-x-5.5" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </span>
                  </div>
                </div>

                {forward && address && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <CopyableAddress value={address} />
                    {openable && url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-ink hover:bg-clay"
                      >
                        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                        {service === "ssh" ? "Ouvrir dans FileZilla" : "Ouvrir"}
                      </a>
                    )}
                    {!unlimited && planLabel && (
                      <span className="text-xs text-ink-soft">
                        Plan {planLabel}
                        {expiry && <> · renouvellement le {expiry}</>}
                      </span>
                    )}
                  </div>
                )}
                {service === "ssh" && forward && address && (
                  <SshFileZillaTutorial address={address} username={router.username} />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Fiche du routeur : visible d'emblée dès qu'un accès est ouvert —
          c'est ce qu'on vérifie avant de s'y connecter. */}
      {hasActiveAccess && (
        <div className="mt-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Fiche du routeur
            {resourcesLoading && <Loader2 aria-label="Chargement" className="h-3 w-3 animate-spin" />}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line-soft sm:grid-cols-4 lg:grid-cols-7">
            {details.map(([label, value]) => (
              <div key={label} className="min-w-0 bg-paper px-3 py-2.5">
                <dt className="text-[11px] text-ink-soft">{label}</dt>
                <dd className="mt-0.5 truncate font-mono text-xs text-ink" title={String(value)}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Porte de monétisation manuelle des accès distants (temporaire). */}
      {paywall && router.tunnelIp && (
        <RemoteAccessPaywallModal
          open
          onClose={() => setPaywall(null)}
          routerId={router.id}
          service={paywall.service}
          initialPeriod={paywall.period}
          latestStatus={null}
          onSubmitted={() => setPaywall(null)}
        />
      )}

      {confirmation && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-ink/45 p-4 sm:items-center sm:justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`access-confirmation-${router.id}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeConfirmation();
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-line-soft bg-paper p-5 shadow-modal">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-deep">
              Confirmation requise
            </p>
            <h3 id={`access-confirmation-${router.id}`} className="mt-2 text-lg font-bold text-ink">
              {confirmation.kind === "disable" ? "Révoquer un accès public ?" : "Activer un accès public ?"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              {confirmation.kind === "disable"
                ? `L’accès ${SERVICE_LABELS[confirmation.service] ?? confirmation.service} de ${router.name} ne sera plus joignable depuis Internet.`
                : confirmation.kind === "enable-all"
                  ? `${confirmation.services.length} accès de ${router.name} deviendront joignables depuis Internet.`
                  : `L’accès ${SERVICE_LABELS[confirmation.service] ?? confirmation.service} de ${router.name} deviendra joignable depuis Internet.`}
            </p>
            {confirmation.kind !== "disable" && (
              <p className="mt-2 rounded-lg bg-clay px-3 py-2 text-xs leading-5 text-ink-soft">
                Vérifiez le mot de passe du routeur avant de continuer. Cette action peut engager la durée de l’accès sélectionnée.
              </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeConfirmation}
                className="min-h-10 rounded-lg border border-line px-4 text-sm font-semibold text-ink hover:bg-clay"
              >
                Annuler
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={confirmAccessChange}
                className={`min-h-10 rounded-lg px-4 text-sm font-semibold text-paper ${
                  confirmation.kind === "disable" ? "bg-err hover:bg-ink" : "bg-ink hover:bg-ink/90"
                }`}
              >
                {confirmation.kind === "disable" ? "Confirmer la révocation" : "Confirmer l’activation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DirectAccessSection({
  routers,
  forwardsByRouter,
  relayHost,
  relayBaseDomain,
  vpnTrial,
}: {
  routers: RouterRow[];
  forwardsByRouter: Record<string, ForwardRow[]>;
  relayHost: string;
  relayBaseDomain: string | null;
  vpnTrial: {
    active: boolean;
    daysRemaining: number;
    unlimited?: boolean;
    quotaMode?: string;
    endsAt?: Date | null;
    paidOverride?: boolean;
    /** Durée d'essai due à CETTE organisation, selon sa date d'inscription. */
    totalDays?: number;
  } | null;
}) {
  const eligible = routers.filter((r) => r.connectionMethod !== "direct" && r.tunnelIp);
  if (eligible.length === 0) return null;

  const unlimited = Boolean(vpnTrial?.unlimited);
  return (
    <section aria-labelledby="acces-directs" className="rounded-2xl border border-line bg-paper p-4 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 id="acces-directs" className="text-lg font-semibold text-ink">
            Accès directs
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Une adresse publique par service, qui mène droit au routeur — sans VPN ni application à
            installer sur l&apos;appareil qui se connecte.
          </p>
        </div>
        {vpnTrial?.unlimited ? (
          <TrialBadge
            active
            activeLabel={
              vpnTrial.quotaMode === "unlimited"
                ? "VPN gratuit illimité"
                : "Compte illimité — Superadmin"
            }
          />
        ) : vpnTrial?.paidOverride ? (
          <TrialBadge active={false} daysRemaining={0} endedLabel="VPN payant" />
        ) : (
          vpnTrial && (
            <TrialBadge
              active={vpnTrial.active}
              daysRemaining={vpnTrial.daysRemaining}
              activeLabel="Essai VPN gratuit"
            />
          )
        )}
      </div>

      {/* La mise en garde est AVANT les interrupteurs, pas en bas de page où
          on la lisait après avoir ouvert le port. */}
      <p className="mt-4 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2.5 text-xs leading-5 text-warn">
        <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        Un accès public est joignable par quiconque connaît l&apos;adresse : seul le mot de passe du
        routeur le protège. Vérifiez qu&apos;il est fort avant d&apos;ouvrir un service.
      </p>

      <div className="mt-5 space-y-6">
        {eligible.map((r) => (
          <RouterDirectAccess
            key={r.id}
            router={r}
            forwards={forwardsByRouter[r.id] ?? []}
            relayHost={r.relayHost ?? relayHost}
            relayBaseDomain={relayBaseDomain}
            unlimited={unlimited}
            quotaExpiresAt={vpnTrial?.quotaMode === "free_until" ? vpnTrial.endsAt ?? null : null}
            showName={eligible.length > 1}
          />
        ))}
      </div>

      <p className="mt-4 flex items-start gap-1.5 text-xs leading-5 text-ink-soft">
        <CreditCard aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          {vpnTrial?.quotaMode === "free_until" && vpnTrial.endsAt
            ? `Ce quota gratuit borne chaque accès jusqu'au ${formatExpiry(vpnTrial.endsAt)}.`
            : "Chaque accès s'active pour 1, 3, 6 ou 12 mois."}{" "}
          {vpnTrial?.paidOverride
            ? "Le superadmin a rendu le VPN payant pour cette organisation : les activations débitent le portefeuille."
            : vpnTrial?.unlimited
              ? vpnTrial.quotaMode === "unlimited"
                ? "Quota superadmin : VPN gratuit sans limite de durée pour cette organisation."
                : "Compte superadmin : aucun débit, sans limite de routeurs ni de durée."
              : vpnTrial?.active
                ? vpnTrial.quotaMode === "free_until"
                  ? "Quota superadmin actif : aucun débit pendant cette période."
                  : `${vpnTrial.totalDays ?? VPN_TRIAL_DAYS} premiers jours offerts dès l'inscription (essai en cours) : aucun débit pendant cette période.`
                : `Le débit du portefeuille est actif (essai de ${vpnTrial?.totalDays ?? VPN_TRIAL_DAYS} jours écoulé), sans blocage de l'accès en cas de solde insuffisant pour l'instant.`}
        </span>
      </p>
    </section>
  );
}
