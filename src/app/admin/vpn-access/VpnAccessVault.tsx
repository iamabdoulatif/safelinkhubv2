"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ChevronDown,
  Clipboard,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  MessageCircle,
  Search,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import {
  recordVpnAccessAudit,
  revealVpnCredentials,
  type VpnAccessInventoryRow,
} from "@/lib/mikrotik/vpn-access-vault-actions";
import { formatVpnAccessWhatsappMessage } from "@/lib/mikrotik/router-recovery";

const SERVICE_LABELS: Record<string, string> = {
  winbox: "WinBox",
  webfig: "WebFig",
  ssh: "SSH / SFTP",
  mikhmon: "MikHmon",
};

const PERIOD_LABELS: Record<string, string> = {
  monthly: "1 mois",
  quarterly: "3 mois",
  semiannual: "6 mois",
  yearly: "12 mois",
};

type Credentials = { username: string | null; password: string | null };

function dateLabel(value: Date | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function statusLabel(status: string) {
  if (status === "online") return "En ligne";
  if (status === "installing" || status === "pending") return "Configuration";
  if (status === "replaced") return "Remplacé";
  return "Hors ligne";
}

export default function VpnAccessVault({ inventory }: { inventory: VpnAccessInventoryRow[] }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, Credentials>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const groups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized
      ? inventory.filter((row) =>
          [row.orgName, row.orgSlug, row.routerName, row.payerName, row.payerEmail, row.cloudDomain, row.publicAddress, row.accessUrl, SERVICE_LABELS[row.service]]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalized),
        )
      : inventory;
    const map = new Map<string, { router: VpnAccessInventoryRow; services: VpnAccessInventoryRow[] }>();
    for (const row of filtered) {
      const existing = map.get(row.routerId);
      if (existing) existing.services.push(row);
      else map.set(row.routerId, { router: row, services: [row] });
    }
    return [...map.values()];
  }, [inventory, query]);

  const totalRouters = new Set(inventory.map((row) => row.routerId)).size;
  const activeServices = inventory.length;
  const expiredServices = inventory.filter((row) => row.expiresAt && new Date(row.expiresAt) < new Date()).length;

  function reveal(routerId: string) {
    setNotice(null);
    startTransition(async () => {
      const result = await revealVpnCredentials(routerId);
      if ("error" in result) setNotice(result.error ?? "Impossible de révéler les identifiants.");
      else setCredentials((current) => ({ ...current, [routerId]: { username: result.username, password: result.password } }));
    });
  }

  async function prepareMessage(group: { router: VpnAccessInventoryRow; services: VpnAccessInventoryRow[] }) {
    const current = credentials[group.router.routerId];
    if (!current) {
      reveal(group.router.routerId);
      setNotice("Révélez d’abord les identifiants pour préparer le message.");
      return;
    }
    const message = formatVpnAccessWhatsappMessage({
      routerName: group.router.routerName,
      username: current.username,
      password: current.password,
      services: group.services.map((row) => row.service),
      serviceLinks: group.services.map((row) => ({ service: row.service, link: row.accessUrl })),
    });
    await recordVpnAccessAudit(group.router.routerId, "whatsapp_prepared");
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  function copyServiceLink(service: VpnAccessInventoryRow) {
    const value = service.accessUrl ?? service.publicAddress;
    if (!value) {
      setNotice("Aucun lien public n’est disponible pour ce service.");
      return;
    }
    startTransition(async () => {
      await navigator.clipboard.writeText(value);
      await recordVpnAccessAudit(service.routerId, "link_copied");
      setNotice(`${SERVICE_LABELS[service.service] ?? service.service} : lien copié.`);
    });
  }

  function copyMessage(group: { router: VpnAccessInventoryRow; services: VpnAccessInventoryRow[] }) {
    const current = credentials[group.router.routerId];
    if (!current) {
      reveal(group.router.routerId);
      setNotice("Révélez d’abord les identifiants pour copier le message.");
      return;
    }
    const message = formatVpnAccessWhatsappMessage({
      routerName: group.router.routerName,
      username: current.username,
      password: current.password,
      services: group.services.map((row) => row.service),
      serviceLinks: group.services.map((row) => ({ service: row.service, link: row.accessUrl })),
    });
    startTransition(async () => {
      await navigator.clipboard.writeText(message);
      await recordVpnAccessAudit(group.router.routerId, "copied");
      setNotice("Message copié dans le presse-papiers.");
    });
  }

  return (
    <div className="animate-fade-in-up space-y-8">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-ok">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Centre de contrôle
          </div>
          <h1 className="text-2xl font-bold text-ink">Accès VPN clients</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Retrouvez les accès achetés, leurs URL opérationnelles et les identifiants à révéler au besoin, sans exposer les secrets dans la liste.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-clay px-4 py-3 text-xs text-ink-soft">
          <KeyRound className="h-4 w-4 text-ok" aria-hidden="true" />
          Journalisation active des consultations
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Routeurs suivis", totalRouters, "Accès actifs"],
          ["Services activés", activeServices, "WinBox · WebFig · SSH · MikHmon"],
          ["À vérifier", expiredServices, expiredServices ? "Accès arrivés à échéance" : "Aucune échéance dépassée"],
        ].map(([label, value, hint]) => (
          <div key={String(label)} className="border border-line bg-paper p-4 rounded-xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{label}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-ink">{value}</p>
            <p className="mt-1 text-xs text-ink-soft">{hint}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 border border-line bg-paper px-4 py-3 rounded-xl">
        <Search className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher par organisation, routeur ou client…"
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft"
        />
        <span className="shrink-0 text-xs tabular-nums text-ink-soft">{groups.length} routeur(s)</span>
      </div>

      {notice && <div className="border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">{notice}</div>}

      {groups.length === 0 ? (
        <div className="border border-dashed border-line bg-paper px-6 py-14 text-center">
          <Wifi className="mx-auto h-8 w-8 text-ink-soft" aria-hidden="true" />
          <p className="mt-3 font-semibold text-ink">Aucun accès VPN actif trouvé</p>
          <p className="mt-1 text-sm text-ink-soft">Les achats apparaîtront ici dès qu’un accès distant sera activé.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const row = group.router;
            const current = credentials[row.routerId];
            const open = expanded === row.routerId;
            return (
              <article key={row.routerId} className="overflow-hidden border border-line bg-paper">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : row.routerId)}
                  className="flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-clay/40"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-clay text-ok">
                    <Wifi className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{row.routerName}</span>
                      <span className="rounded-full bg-clay px-2 py-0.5 text-[11px] font-medium text-ink-soft">{row.orgName}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${row.routerStatus === "online" ? "bg-green-50 text-ok" : "bg-clay text-ink-soft"}`}>
                        {statusLabel(row.routerStatus)}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs text-ink-soft">{group.services.length} service(s) · acheté le {dateLabel(row.purchasedAt)}</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
                {open && (
                  <div className="border-t border-line-soft bg-[#fcfbf8] px-4 py-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.services.map((service) => (
                          <div key={service.id} className="rounded-lg border border-line bg-paper px-3 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-ink">{SERVICE_LABELS[service.service] ?? service.service}</span>
                              <span className="font-mono text-xs text-ink-soft">
                                {service.cloudDomain ? "Domaine cloud" : `:${service.publicPort}`}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-ink-soft">{PERIOD_LABELS[service.billingPeriod] ?? service.billingPeriod} · expire le {dateLabel(service.expiresAt)}</p>
                            <div className="mt-3 rounded-md bg-clay/60 px-2.5 py-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">Lien opérationnel</p>
                              {service.accessUrl ? (
                                <div className="mt-1 flex items-center gap-2">
                                  <a
                                    href={service.accessUrl}
                                    target={service.service === "webfig" || service.service === "mikhmon" ? "_blank" : undefined}
                                    rel="noreferrer"
                                    className="min-w-0 flex-1 truncate font-mono text-xs text-ink underline decoration-line hover:text-ok"
                                  >
                                    {service.accessUrl}
                                  </a>
                                  <button type="button" onClick={() => copyServiceLink(service)} className="shrink-0 rounded p-1 text-ink-soft hover:bg-paper hover:text-ink" title="Copier le lien">
                                    <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
                                  </button>
                                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-ink-soft" aria-hidden="true" />
                                </div>
                              ) : (
                                <p className="mt-1 text-xs text-ink-soft">Hôte public non configuré</p>
                              )}
                              {service.publicAddress && <p className="mt-1 font-mono text-[11px] text-ink-soft">Adresse : {service.publicAddress}</p>}
                            </div>
                            {(service.payerName || service.payerEmail) && <p className="mt-2 truncate text-xs text-ink-soft">Payé par {service.payerName || service.payerEmail}</p>}
                          </div>
                        ))}
                      </div>
                      <div className="flex min-w-[220px] flex-col gap-2">
                        <button type="button" onClick={() => current ? setCredentials((previous) => { const next = { ...previous }; delete next[row.routerId]; return next; }) : reveal(row.routerId)} disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-60">
                          {current ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                          {current ? "Masquer les identifiants" : "Révéler les identifiants"}
                        </button>
                        {current && (
                          <div className="rounded-lg border border-line bg-clay px-3 py-2 text-xs text-ink">
                            <div>Utilisateur : <code>{current.username || "—"}</code></div>
                            <div className="mt-1">Mot de passe : <code>{current.password || "—"}</code></div>
                          </div>
                        )}
                        <button type="button" onClick={() => copyMessage(group)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm font-medium text-ink hover:bg-clay">
                          <Clipboard className="h-4 w-4" aria-hidden="true" /> Copier le message
                        </button>
                        <button type="button" onClick={() => prepareMessage(group)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#25D366] px-3 py-2 text-sm font-semibold text-white hover:bg-[#20bd5a]">
                          <MessageCircle className="h-4 w-4" aria-hidden="true" /> Préparer WhatsApp
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <p className="text-xs leading-relaxed text-ink-soft">Les mots de passe ne sont jamais inclus dans l’inventaire initial. Chaque révélation, copie ou préparation WhatsApp est journalisée pour garder une trace du support.</p>
    </div>
  );
}
