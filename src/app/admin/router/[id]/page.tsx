import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Clock, Router as RouterIcon, Users, Cpu, MemoryStick } from "lucide-react";
import { getDb } from "@/lib/db";
import { bridges, routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import HeaderActions from "./HeaderActions";
import RouterDetailTabs from "./RouterDetailTabs";

function formatUptime(seconds: number) {
  if (seconds <= 0) return "0m";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}j`);
  if (hours) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

function timeAgo(date: Date | null) {
  if (!date) return "jamais";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "à l'instant";
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `il y a ${Math.floor(seconds / 3600)} h`;
  return `il y a ${Math.floor(seconds / 86400)} j`;
}

function Badge({ tone, children }: { tone: "ok" | "brand" | "muted"; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border-2 border-line px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wide ${
        tone === "brand" ? "bg-brand text-[#1C1917]" : "bg-paper text-ink"
      }`}
    >
      {tone !== "brand" && (
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${tone === "ok" ? "bg-ok" : "bg-err"}`}
        />
      )}
      {children}
    </span>
  );
}

// Le test de débit (server action « speedTestRouter » de cette page) attend la
// fin d'un téléchargement de test côté routeur, jusqu'à ~75 s sur un lien lent —
// au-delà du timeout par défaut des Server Actions. On le relève ici (les
// actions héritent du maxDuration de la page qui les invoque).
export const maxDuration = 120;

export default async function RouterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();

  const db = getDb();
  // Le superadmin (opérateur de la plateforme) peut ouvrir la fiche de N'IMPORTE
  // quel routeur pour y mener des actions ; un admin reste limité à son org.
  const [router] = await db
    .select()
    .from(routers)
    .where(
      isSuperAdmin(session.role)
        ? eq(routers.id, id)
        : and(eq(routers.id, id), eq(routers.orgId, session.orgId)),
    )
    .limit(1);

  if (!router) notFound();

  const routerBridges = await db
    .select()
    .from(bridges)
    .where(eq(bridges.routerId, router.id));

  const online = router.status === "online";
  const configured = routerBridges.length > 0 || Boolean(router.lastAutoSetupConfig);
  const hotspotBridges = routerBridges.filter((b) => b.hotspotEnabled).length;
  const pppoeBridges = routerBridges.filter((b) => !b.hotspotEnabled).length;

  const metrics = [
    {
      label: "Utilisateurs actifs",
      value: String(router.activeUsers ?? 0),
      hint: `${hotspotBridges} bridge${hotspotBridges > 1 ? "s" : ""} hotspot · ${pppoeBridges} PPPoE`,
      icon: Users,
    },
    {
      label: "Uptime",
      value: formatUptime(router.uptimeSeconds ?? 0),
      hint: `Dernière synchro ${timeAgo(router.lastSyncAt)}`,
      icon: Clock,
    },
    {
      label: "Charge CPU",
      value: `${router.cpuLoad ?? 0}%`,
      hint: router.model ?? "modèle inconnu",
      icon: Cpu,
    },
    {
      label: "Mémoire",
      value: `${Math.round(Number(router.memoryUsage ?? 0))}%`,
      hint: "utilisation RAM",
      icon: MemoryStick,
    },
  ];

  const overview = (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="border-2 border-line bg-paper p-4">
        <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ink">
          Connexion
        </h3>
        <dl className="mt-2 divide-y divide-line-soft text-sm">
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-ink-soft">Adresse</dt>
            <dd className="font-mono font-semibold text-ink">
              {router.host ? `${router.host}:${router.apiPort ?? 8728}` : "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-ink-soft">Méthode</dt>
            <dd className="font-semibold text-ink">
              {router.connectionMethod === "vpn" ? "Tunnel WireGuard" : "Directe (API)"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-ink-soft">Modèle</dt>
            <dd className="font-mono font-semibold text-ink">{router.model ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-ink-soft">Ajouté le</dt>
            <dd className="font-semibold text-ink">
              {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(router.createdAt)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="border-2 border-line bg-paper p-4">
        <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ink">
          Bridges provisionnés
        </h3>
        {routerBridges.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">
            Aucun bridge pour l&apos;instant — utilisez l&apos;onglet «&nbsp;Configurer
            les services&nbsp;» pour définir la topologie.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line-soft text-sm">
            {routerBridges.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-mono font-semibold text-ink">{b.name}</span>
                <span className="flex items-center gap-2">
                  <span className="bg-clay px-2 py-0.5 font-mono text-xs text-ink">
                    {b.gatewayIp}/{b.subnetBits}
                  </span>
                  <span
                    className={`px-2 py-0.5 font-mono text-[11px] font-bold uppercase ${
                      b.hotspotEnabled ? "bg-brand text-[#1C1917]" : "bg-clay text-ink-soft"
                    }`}
                  >
                    {b.hotspotEnabled ? "Hotspot" : "LAN"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  return (
    <div className="animate-fade-in-up">
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-line bg-brand"
          >
            <RouterIcon className="h-6 w-6 text-[#1C1917]" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
              {router.name}
            </h1>
            <p className="mt-0.5 font-mono text-sm text-ink-soft">
              {router.host ? `${router.host}:${router.apiPort ?? 8728}` : "adresse inconnue"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone={online ? "ok" : "muted"}>{online ? "En ligne" : "Hors ligne"}</Badge>
              {configured && <Badge tone="brand">Configuré</Badge>}
            </div>
          </div>
        </div>
        <HeaderActions routerId={router.id} locked={Boolean(router.portsLockedAt)} />
      </div>

      {/* Cartes métriques */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(({ label, value, hint, icon: Icon }) => (
          <div key={label} className="border-2 border-line bg-paper p-4 hover-lift">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-soft">
                {label}
              </p>
              <Icon aria-hidden="true" className="h-4 w-4 text-ink-soft" />
            </div>
            <p className="mt-2 font-display text-2xl font-extrabold text-ink">{value}</p>
            <p className="mt-1 truncate text-xs text-ink-soft">{hint}</p>
          </div>
        ))}
      </div>

      <RouterDetailTabs routerId={router.id} online={online} overview={overview} />
    </div>
  );
}
