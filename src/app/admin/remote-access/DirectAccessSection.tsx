"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Copy, CreditCard, ExternalLink, Globe2, Loader2, ShieldOff } from "lucide-react";
import { disablePortForward, enablePortForward } from "@/lib/mikrotik/port-forward";
import { PERIOD_PRICE_CENTS, type BillingPeriod } from "@/lib/mikrotik/billing-plans";
import { getRouterResources, type RouterResources } from "@/lib/mikrotik/router-resources";

type RouterRow = {
  id: string;
  name: string;
  status: string;
  connectionMethod: string;
  tunnelIp: string | null;
  username: string | null;
};

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
      className="flex items-center gap-1.5 rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
      title="Copier"
    >
      {value}
      <Copy className="h-3 w-3 text-slate-400" />
      {copied && <span className="text-emerald-600">Copié</span>}
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
    <div className="mt-2 rounded-md border border-slate-100 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-2.5 py-2 text-left text-[11px] font-medium text-slate-600"
      >
        Configurer FileZilla (SFTP)
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-slate-100 px-2.5 py-2 text-[11px] text-slate-600">
          <p className="font-medium text-slate-700">
            Étape 1 (une seule fois par ordinateur) — faire de FileZilla le gestionnaire par
            défaut du lien <code className="rounded bg-slate-100 px-1">sftp://</code>
          </p>
          <p className="mt-1 text-slate-500">
            Le bouton <ExternalLink className="inline h-3 w-3" /> ci-dessus ouvre un lien{" "}
            <code className="rounded bg-slate-100 px-1">sftp://</code> — c&apos;est{" "}
            {os === "windows" ? "Windows" : "le système (macOS Launch Services ou équivalent)"},
            pas FileZilla ni ce site, qui décide quelle app reçoit ce lien. Si une autre app (VLC,
            par exemple) s&apos;est enregistrée pour ce type de lien, faites ceci{" "}
            <span className="font-medium">une seule fois</span> pour que ce soit FileZilla à
            partir de maintenant :
          </p>

          {os === "windows" ? (
            <>
              <p className="mt-1.5 text-slate-500">
                Ouvrez PowerShell et lancez (ajustez le chemin si FileZilla n&apos;est pas
                installé dans <code className="rounded bg-slate-100 px-1">Program Files</code>) :
              </p>
              <pre className="mt-1.5 overflow-x-auto rounded-md bg-slate-900 px-3 py-2 text-[11px] text-emerald-300">
                {`reg add "HKCU\\Software\\Classes\\sftp" /ve /d "URL:SFTP Protocol" /f
reg add "HKCU\\Software\\Classes\\sftp" /v "URL Protocol" /d "" /f
reg add "HKCU\\Software\\Classes\\sftp\\shell\\open\\command" /ve /d "\\"C:\\Program Files\\FileZilla FTP Client\\filezilla.exe\\" \\"%1\\"" /f`}
              </pre>
              <p className="mt-1 text-slate-500">
                Fermez et rouvrez le navigateur après la commande. Vous pouvez vérifier le chemin
                exact de <code className="rounded bg-slate-100 px-1">filezilla.exe</code> via un
                clic droit sur son raccourci → Propriétés.
              </p>
            </>
          ) : (
            <>
              <p className="mt-1.5 text-slate-500">Dans le Terminal :</p>
              <pre className="mt-1.5 overflow-x-auto rounded-md bg-slate-900 px-3 py-2 text-[11px] text-emerald-300">
                brew install duti{"\n"}duti -s org.filezilla-project.filezilla sftp all
              </pre>
              <p className="mt-1 text-slate-500">
                (Sans Homebrew : installez-le d&apos;abord avec{" "}
                <code className="rounded bg-slate-100 px-1">
                  /bin/bash -c &quot;$(curl -fsSL
                  https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)&quot;
                </code>
                .)
              </p>
            </>
          )}
          <p className="mt-1 text-slate-500">
            Une fois fait, le bouton ci-dessus ouvrira directement FileZilla, hôte/port/
            utilisateur déjà pré-remplis.
          </p>

          <p className="mt-2 font-medium text-slate-700">
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
          <p className="mt-1.5 text-amber-600">
            Avec la barre Quickconnect plutôt que le Gestionnaire de sites, préfixez l&apos;hôte
            avec <code className="rounded bg-amber-50 px-1">sftp://</code>, sinon FileZilla tente
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
}: {
  router: RouterRow;
  forwards: ForwardRow[];
  relayHost: string;
}) {
  const navRouter = useRouter();
  const [pendingService, setPendingService] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resources, setResources] = useState<RouterResources | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  // Plan chosen per service before activating it — defaults to monthly.
  // Billing isn't enforced yet (see port-forward.ts), but the choice is
  // still recorded so the UI already reflects what a real subscription
  // would look like once payment goes live.
  const [selectedPlans, setSelectedPlans] = useState<Record<string, BillingPeriod>>({});

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

  function handleEnable(service: string) {
    setPendingService(service);
    setError(null);
    const plan = selectedPlans[service] ?? "monthly";
    startTransition(async () => {
      const res = await enablePortForward(router.id, service, plan);
      setPendingService(null);
      if (res?.error) setError(res.error);
      else navRouter.refresh();
    });
  }

  function handleDisable(forwardId: string) {
    startTransition(async () => {
      const res = await disablePortForward(forwardId);
      if (res?.error) setError(res.error);
      else navRouter.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <button
        type="button"
        onClick={() => setCardOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2">
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${cardOpen ? "rotate-180" : ""}`}
          />
          <span className="text-sm font-medium text-slate-700">{router.name}</span>
          {hasActiveAccess && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
              {activeServices.size} actif{activeServices.size > 1 ? "s" : ""}
            </span>
          )}
        </span>
        {router.status !== "online" && (
          <span className="text-xs text-slate-400">Routeur hors ligne</span>
        )}
      </button>

      {cardOpen && (
        <>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-2 space-y-2">
        {(["winbox", "webfig", "ssh", "mikhmon"] as const).map((service) => {
          const forward = forwards.find((f) => f.service === service);
          const isPublic = Boolean(forward);
          const busy = pending && (pendingService === service || (isPublic && pending));
          const expiry = formatExpiry(forward?.expiresAt ?? null);
          const planLabel = forward
            ? BILLING_PERIOD_LABELS[(forward.billingPeriod as BillingPeriod) ?? "monthly"]
            : null;
          return (
            <div key={service} className="rounded-md px-0 py-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{SERVICE_LABELS[service]}</span>
                <div className="flex items-center gap-2">
                  {forward && <CopyableAddress value={`${relayHost}:${forward.publicPort}`} />}
                  {!isPublic && (
                    <select
                      value={selectedPlans[service] ?? "monthly"}
                      onChange={(e) =>
                        setSelectedPlans((prev) => ({
                          ...prev,
                          [service]: e.target.value as BillingPeriod,
                        }))
                      }
                      disabled={busy}
                      title="Plan de facturation (paiement non encore activé)"
                      className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-600 focus:border-slate-400 focus:outline-none disabled:opacity-50"
                    >
                      <option value="monthly">1 mois — {formatFcfa(PERIOD_PRICE_CENTS.monthly)}</option>
                      <option value="quarterly">3 mois — {formatFcfa(PERIOD_PRICE_CENTS.quarterly)}</option>
                      <option value="semiannual">6 mois — {formatFcfa(PERIOD_PRICE_CENTS.semiannual)}</option>
                      <option value="yearly">12 mois — {formatFcfa(PERIOD_PRICE_CENTS.yearly)}</option>
                    </select>
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isPublic}
                    disabled={busy || (!isPublic && router.status !== "online")}
                    onClick={() =>
                      isPublic ? handleDisable(forward!.id) : handleEnable(service)
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                      isPublic ? "bg-red-500" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform ${
                        isPublic ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <span
                    className={`flex w-14 items-center gap-1 text-xs font-medium ${
                      isPublic ? "text-red-600" : "text-slate-500"
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
                <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-slate-400">
                  <CreditCard className="h-3 w-3" />
                  Plan {planLabel}
                  {expiry && <> · renouvellement le {expiry}</>}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        {hasActiveAccess
          ? "Connectez-vous directement avec ces adresses, sans VPN ni app à installer."
          : "Aucun accès direct actif."}
      </p>

      {hasActiveAccess && (
        <div className="mt-3 rounded-md border border-slate-100 bg-slate-50/60 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {forwards.map((forward) => {
              const address = `${relayHost}:${forward.publicPort}`;
              const url = serviceUrl(forward.service, address, router.username);
              return (
                <div key={forward.id} className="min-w-0">
                  <div className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-white px-2.5 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-700">
                        {SERVICE_LABELS[forward.service] ?? forward.service}
                      </p>
                      <p className="truncate text-slate-500">{address}</p>
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
                          className="rounded bg-slate-100 p-1.5 text-slate-500 hover:bg-slate-200"
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

          <div className="mt-3 rounded-md border border-slate-100 bg-white">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="flex w-full items-center justify-between px-2.5 py-2 text-left text-[11px] font-medium text-slate-600"
            >
              {showDetails ? "Masquer les détails du routeur" : "Afficher les détails du routeur"}
              <ChevronDown
                className={`h-3.5 w-3.5 text-slate-400 transition-transform ${showDetails ? "rotate-180" : ""}`}
              />
            </button>
            {showDetails && (
              <div className="overflow-x-auto border-t border-slate-100">
                <table className="w-full min-w-[760px] text-left text-[11px]">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">MAC WAN</th>
                    <th className="px-2 py-1.5 font-medium">IP WAN</th>
                    <th className="px-2 py-1.5 font-medium">IP publique</th>
                    <th className="px-2 py-1.5 font-medium">IP tunnel</th>
                    <th className="px-2 py-1.5 font-medium">Identity</th>
                    <th className="px-2 py-1.5 font-medium">Version</th>
                    <th className="px-2 py-1.5 font-medium">Board</th>
                    <th className="px-2 py-1.5 font-medium">Uptime</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-100">
                    <td className="px-2 py-1.5 font-medium text-slate-700">
                      {resourcesLoading && !resources ? (
                        <span className="flex items-center gap-1 text-slate-400">
                          <Loader2 className="h-3 w-3 animate-spin" /> ...
                        </span>
                      ) : (
                        summary?.wanMacAddress || "—"
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-slate-600">{summary?.wanIpAddress || "—"}</td>
                    <td className="px-2 py-1.5 text-slate-600">{relayHost || "—"}</td>
                    <td className="px-2 py-1.5 text-slate-600">{summary?.tunnelIp || router.tunnelIp || "—"}</td>
                    <td className="px-2 py-1.5 font-medium text-slate-700">
                      {summary?.identity ?? resources?.identity ?? router.name}
                    </td>
                    <td className="px-2 py-1.5 text-slate-600">{resources?.version ?? "—"}</td>
                    <td className="px-2 py-1.5 text-slate-600">{resources?.boardName ?? "—"}</td>
                    <td className="px-2 py-1.5 text-slate-600">{resources?.uptime ?? "—"}</td>
                  </tr>
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

export default function DirectAccessSection({
  routers,
  forwardsByRouter,
  relayHost,
}: {
  routers: RouterRow[];
  forwardsByRouter: Record<string, ForwardRow[]>;
  relayHost: string;
}) {
  const eligible = routers.filter((r) => r.connectionMethod !== "direct" && r.tunnelIp);
  if (eligible.length === 0) return null;

  return (
    <div className="mt-10 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <Globe2 className="h-5 w-5 text-slate-700" />
        <h2 className="font-semibold text-slate-900">
          Accès direct sans VPN (WinBox / WebFig)
        </h2>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Ouvre une adresse publique (relais:port) qui redirige directement
        vers le routeur — aucun client VPN, aucune app à installer sur
        l&apos;appareil qui se connecte. Fonctionne depuis n&apos;importe
        quel PC, téléphone, ou WinBox.
      </p>

      <p className="mt-3 flex items-start gap-1.5 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-700">
        <CreditCard className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Chaque accès est activable pour 1, 3, 6 ou 12 mois — choisissez la durée avant
        d&apos;activer un service. La facturation n&apos;est pas encore activée : tous les plans
        restent gratuits pour le moment pour tous les utilisateurs, mais la date de
        renouvellement est déjà affichée à titre indicatif.
      </p>

      <div className="mt-4 space-y-3">
        {eligible.map((r) => (
          <RouterDirectAccess
            key={r.id}
            router={r}
            forwards={forwardsByRouter[r.id] ?? []}
            relayHost={relayHost}
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
