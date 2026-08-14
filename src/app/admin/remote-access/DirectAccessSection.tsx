"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Copy, CreditCard, ExternalLink, Globe2, Loader2, ShieldOff } from "lucide-react";
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
};

const SERVICE_LABELS: Record<string, string> = {
  winbox: "WinBox",
  webfig: "WebFig (navigateur)",
  ssh: "SSH (SFTP — FileZilla, etc.)",
  mikhmon: "MikHmon (vouchers)",
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
      className="flex items-center gap-1.5 rounded bg-clay px-2 py-1 text-xs font-medium text-ink hover:bg-clay"
      title="Copier"
    >
      {value}
      <Copy className="h-3 w-3 text-ink-soft" />
      {copied && <span className="text-ok">Copié</span>}
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
    <div className="mt-2 rounded-md border border-line-soft bg-paper">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-2.5 py-2 text-left text-[11px] font-medium text-ink-soft"
      >
        Configurer FileZilla (SFTP)
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-line-soft px-2.5 py-2 text-[11px] text-ink-soft">
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
              <pre className="mt-1.5 code-block px-3 py-2 text-[11px]">
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
              <pre className="mt-1.5 code-block px-3 py-2 text-[11px]">
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
}: {
  router: RouterRow;
  forwards: ForwardRow[];
  relayHost: string;
  relayBaseDomain: string | null;
  unlimited: boolean;
  quotaExpiresAt: Date | null;
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
  const [showDetails, setShowDetails] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
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
    setCardOpen(true);
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

  return (
    <div className="rounded-lg border border-line-soft p-3">
      <div className="flex w-full items-center justify-between gap-2 text-left">
        <button
          type="button"
          onClick={() => setCardOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={cardOpen}
        >
        <span className="flex items-center gap-2">
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform ${cardOpen ? "rotate-180" : ""}`}
          />
          <span className="text-sm font-medium text-ink">{router.name}</span>
          {hasActiveAccess && (
            <span className="rounded-full bg-clay px-2 py-0.5 text-[11px] font-medium text-ok">
              {activeServices.size} actif{activeServices.size > 1 ? "s" : ""}
            </span>
          )}
        </span>
        </button>
        <span className="flex items-center gap-2">
          {router.status !== "online" && (
            <span className="text-xs text-ink-soft">Routeur hors ligne</span>
          )}
          {unlimited && activeServices.size < 4 && (
            <button
              type="button"
              disabled={pending}
              onClick={(event) => requestEnableAll(event.currentTarget)}
              className="flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold text-[#1C1917] hover:bg-brand-deep disabled:opacity-60"
            >
              {pending && pendingService && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
              {pending
                ? pendingService
                  ? `${SERVICE_LABELS[pendingService] ?? pendingService}…`
                  : "Activation…"
                : `Tout activer (${4 - activeServices.size})`}
            </button>
          )}
        </span>
      </div>

      {cardOpen && (
        <>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-2 space-y-2">
        {(["winbox", "webfig", "ssh", "mikhmon"] as const).map((service) => {
          const forward = forwards.find((f) => f.service === service);
          const isPublic = Boolean(forward);
          const busy = pending && pendingService === service;
          const expiry = formatExpiry(forward?.expiresAt ?? null);
          const planLabel = forward
            ? forward.billingPeriod === "free_until"
              ? `Gratuit jusqu'au ${formatExpiry(forward.expiresAt) ?? "quota"}`
              : BILLING_PERIOD_LABELS[(forward.billingPeriod as BillingPeriod) ?? "monthly"]
            : null;
          return (
            <div key={service} className="rounded-md px-0 py-1">
              <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="text-ink-soft">{SERVICE_LABELS[service]}</span>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {forward && (
                    <CopyableAddress
                      value={
                        relayBaseDomain && isWebAccessService(service)
                          ? `https://${relayHost}:${forward.publicPort}`
                          : `${relayHost}:${forward.publicPort}`
                      }
                    />
                  )}
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
                      title="Plan de facturation (paiement non encore activé)"
                      className="rounded-md border-2 border-line bg-paper px-1.5 py-1 text-[11px] text-ink-soft focus:border-line-soft focus:outline-none disabled:opacity-50"
                    >
                      {quotaExpiresAt ? (
                        <option value="__quota__">Accès gratuit jusqu&apos;au {formatExpiry(quotaExpiresAt)}</option>
                      ) : (
                        <>
                          <option value="monthly">1 mois — {formatFcfa(PERIOD_PRICE_CENTS.monthly)}</option>
                          <option value="quarterly">3 mois — {formatFcfa(PERIOD_PRICE_CENTS.quarterly)}</option>
                          <option value="semiannual">6 mois — {formatFcfa(PERIOD_PRICE_CENTS.semiannual)}</option>
                          <option value="yearly">12 mois — {formatFcfa(PERIOD_PRICE_CENTS.yearly)}</option>
                        </>
                      )}
                      {unlimited && (
                        <option value="__unlimited__">Forfait illimité</option>
                      )}
                    </select>
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isPublic}
                    disabled={busy || (!isPublic && router.status !== "online" && !unlimited)}
                    onClick={(event) =>
                      isPublic
                        ? requestDisable(forward!.id, service, event.currentTarget)
                        : requestEnable(service, event.currentTarget)
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                      isPublic ? "bg-red-500" : "bg-line-soft"
                    }`}
                  >
                    <span
                      className={`inline-block h-4.5 w-4.5 transform rounded-full bg-paper shadow transition-transform ${
                        isPublic ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <span
                    className={`flex w-14 items-center gap-1 text-xs font-medium ${
                      isPublic ? "text-red-600" : "text-ink-soft"
                    }`}
                  >
                    {pendingService === service ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : isPublic ? (
                      <Globe2 className="h-3 w-3" />
                    ) : (
                      <ShieldOff className="h-3 w-3 rotate-180" />
                    )}
                    {isPublic ? "Public" : "Privé"}
                  </span>
                </div>
              </div>
              {isPublic && (
                <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-ink-soft">
                  <CreditCard className="h-3 w-3" />
                  {unlimited ? (
                    "Forfait illimité"
                  ) : (
                    <>
                      Plan {planLabel}
                      {expiry && <> · renouvellement le {expiry}</>}
                    </>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-ink-soft">
        {hasActiveAccess
          ? "Connectez-vous directement avec ces adresses, sans VPN ni app à installer."
          : "Aucun accès direct actif."}
      </p>

      {hasActiveAccess && (
        <div className="mt-3 rounded-md border border-line-soft bg-clay/60 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {forwards.map((forward) => {
              // Browser services are served over HTTPS on their public port by
              // the relay's nginx (wildcard *.<base> cert) so they work under
              // browsers' HTTPS-First mode; WinBox/SSH keep their raw host:port.
              const isWebHttps = Boolean(relayBaseDomain) && isWebAccessService(forward.service);
              const address = isWebHttps
                ? `https://${relayHost}:${forward.publicPort}`
                : `${relayHost}:${forward.publicPort}`;
              const url = isWebHttps
                ? address
                : serviceUrl(forward.service, address, router.username);
              return (
                <div key={forward.id} className="min-w-0">
                  <div className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-paper px-2.5 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        {SERVICE_LABELS[forward.service] ?? forward.service}
                      </p>
                      <p className="truncate text-ink-soft">{address}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <CopyableAddress value={address} />
                      {(forward.service === "webfig" ||
                        forward.service === "mikhmon" ||
                        forward.service === "ssh") && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded bg-clay p-1.5 text-ink-soft hover:bg-clay"
                          title={forward.service === "ssh" ? "Ouvrir dans FileZilla" : "Ouvrir"}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                  {forward.service === "ssh" && (
                    <SshFileZillaTutorial address={address} username={router.username} />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 rounded-md border border-line-soft bg-paper">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="flex w-full items-center justify-between px-2.5 py-2 text-left text-[11px] font-medium text-ink-soft"
            >
              {showDetails ? "Masquer les détails du routeur" : "Afficher les détails du routeur"}
              <ChevronDown
                className={`h-3.5 w-3.5 text-ink-soft transition-transform ${showDetails ? "rotate-180" : ""}`}
              />
            </button>
            {showDetails && (
              <div className="grid grid-cols-1 gap-x-4 gap-y-2 border-t border-line-soft p-3 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
                {(
                  [
                    [
                      "MAC WAN",
                      resourcesLoading && !resources ? (
                        <span key="loading" className="flex items-center gap-1 text-ink-soft">
                          <Loader2 className="h-3 w-3 animate-spin" /> ...
                        </span>
                      ) : (
                        summary?.wanMacAddress || "—"
                      ),
                    ],
                    ["IP WAN", summary?.wanIpAddress || "—"],
                    ["Adresse publique", relayHost || "—"],
                    ["IP tunnel", summary?.tunnelIp || router.tunnelIp || "—"],
                    ["Identity", summary?.identity ?? resources?.identity ?? router.name],
                    ["Version", resources?.version ?? "—"],
                    ["Board", resources?.boardName ?? "—"],
                    ["Uptime", resources?.uptime ?? "—"],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <p className="text-ink-soft">{label}</p>
                    <p className="truncate font-medium text-ink">{value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
        </>
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
          <div className="w-full max-w-md rounded-xl border border-line-soft bg-paper p-5 shadow-xl">
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
              <p className="mt-2 rounded-md bg-clay px-3 py-2 text-xs leading-5 text-ink-soft">
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
                  confirmation.kind === "disable" ? "bg-red-600 hover:bg-red-700" : "bg-ink hover:bg-ink/90"
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
  } | null;
}) {
  const eligible = routers.filter((r) => r.connectionMethod !== "direct" && r.tunnelIp);
  if (eligible.length === 0) return null;

  return (
    <div className="mt-10 border-2 border-line bg-paper p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Globe2 className="h-5 w-5 text-ink" />
          <h2 className="font-semibold text-ink">
            Accès direct sans VPN (WinBox / WebFig)
          </h2>
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
      <p className="mt-1 text-sm text-ink-soft">
        Ouvre une adresse publique (relais:port) qui redirige directement
        vers le routeur — aucun client VPN, aucune app à installer sur
        l&apos;appareil qui se connecte. Fonctionne depuis n&apos;importe
        quel PC, téléphone, ou WinBox.
      </p>

      <p className="mt-3 flex items-start gap-1.5 rounded-md bg-clay px-3 py-2 text-xs text-ink">
        <CreditCard className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {vpnTrial?.quotaMode === "free_until" && vpnTrial.endsAt
          ? `Ce quota gratuit borne chaque accès jusqu'au ${formatExpiry(vpnTrial.endsAt)}.`
          : "Chaque accès est activable pour 1, 3, 6 ou 12 mois — choisissez la durée avant d'activer un service."}{" "}
        {vpnTrial?.paidOverride
          ? "Le superadmin a rendu le VPN payant pour cette organisation : les activations débitent le portefeuille."
          : vpnTrial?.unlimited
            ? vpnTrial.quotaMode === "unlimited"
              ? "Quota superadmin : VPN gratuit sans limite de durée pour cette organisation."
              : "Compte superadmin : aucun débit, sans limite de routeurs ni de durée."
          : vpnTrial?.active
            ? vpnTrial.quotaMode === "free_until"
              ? "Quota superadmin actif : aucun débit pendant cette période."
              : `${VPN_TRIAL_DAYS} premiers jours offerts dès l'inscription (essai en cours) : aucun débit pendant cette période.`
            : `Le débit du portefeuille est actif (essai de ${VPN_TRIAL_DAYS} jours écoulé), sans blocage de l'accès en cas de solde insuffisant pour l'instant.`}{" "}
        La date de renouvellement est affichée à titre indicatif.
      </p>

      <div className="mt-4 space-y-3">
        {eligible.map((r) => (
          <RouterDirectAccess
            key={r.id}
            router={r}
            forwards={forwardsByRouter[r.id] ?? []}
            relayHost={r.relayHost ?? relayHost}
            relayBaseDomain={relayBaseDomain}
            unlimited={Boolean(vpnTrial?.unlimited)}
            quotaExpiresAt={vpnTrial?.quotaMode === "free_until" ? vpnTrial.endsAt ?? null : null}
          />
        ))}
      </div>

      <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
        Attention : ce port devient joignable par quiconque connaît
        l&apos;adresse — seule l&apos;authentification du routeur protège
        l&apos;accès. Utilisez un mot de passe fort sur le routeur avant
        d&apos;activer ceci.
      </p>
    </div>
  );
}
