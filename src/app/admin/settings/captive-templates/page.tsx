import Link from "next/link";
import { after } from "next/server";
import { ArrowLeft } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { MonitorSmartphone, Layers, Plus, Send } from "lucide-react";
import { getDb } from "@/lib/db";
import { bridges, routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { refreshStaleRouters } from "@/lib/mikrotik/router-sync";
import { listCaptiveTemplates } from "@/lib/captive-templates/actions";
import {
  loadSafelinkhubDefaultPackage,
  loadYahyaWifiPackage,
  type PackageFile,
} from "@/lib/captive-templates/package-files";
import TemplatesManager from "./TemplatesManager";
import DefaultPortals, { type DefaultPortal } from "./DefaultPortals";
import BridgeAssignments from "./BridgeAssignments";
import InstallOnRouter from "./InstallOnRouter";
import ThemeGallery from "./ThemeGallery";
import InstalledPortals, { type InstalledPortal } from "./InstalledPortals";
import { signPreviewToken } from "@/lib/captive-templates/preview-token";

// PackagePreview ne lit que le schéma de couleurs des CSS — on n'envoie donc que
// les .css au client pour l'aperçu, pas les images base64 du package entier.
const cssOnly = (files: PackageFile[]) =>
  files.filter((f) => f.path.endsWith(".css") && f.encoding === "utf8");

const VUES = [
  { id: "routeurs", label: "Sur vos routeurs", icon: MonitorSmartphone },
  { id: "modeles", label: "Mes modèles", icon: Layers },
  { id: "ajouter", label: "Ajouter", icon: Plus },
  { id: "deployer", label: "Déployer", icon: Send },
] as const;

export default async function CaptiveTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ retour?: string; vue?: string }>;
}) {
  const session = await getSession();
  const db = getDb();
  // "?retour=<routerId>" : l'admin est arrivé ici depuis l'étape « Portail
  // captif » du wizard de configuration routeur — offre le chemin inverse
  // vers ce même wizard, sinon il n'a aucun lien pour y retourner après
  // avoir importé/choisi son portail.
  const { retour, vue: vueParam } = await searchParams;
  const vue = VUES.some((v) => v.id === vueParam) ? vueParam! : "routeurs";

  // Le sélecteur « Installer sur un routeur » affiche le statut brut de la base,
  // que seules /admin/router et /admin/remote-access rafraîchissaient : un
  // routeur parfaitement joignable pouvait donc rester marqué « offline » ici
  // indéfiniment (le sync périodique ne tourne pas hors Vercel Cron), et
  // décourager une installation qui aurait très bien fonctionné.
  if (session) {
    after(() => refreshStaleRouters(session.orgId));
  }

  const templates = await listCaptiveTemplates();

  // Les 2 portails « package » prêts à l'emploi fournis par SafeLinkHub, mis en
  // avant dans CHAQUE org. « alreadyAdded » = l'org a déjà un modèle package du
  // même nom bundled (hotspot-sfh1/2), auquel cas le bouton propose une mise à
  // jour plutôt qu'une adoption.
  const defaultPortals: DefaultPortal[] = [
    {
      key: "sfh1",
      name: "Portail SafeLinkHub",
      description: "Le portail hotspot officiel SafeLinkHub, prêt à l'emploi.",
      previewFiles: cssOnly(loadSafelinkhubDefaultPackage()),
      alreadyAdded: templates.some((t) => t.name === "hotspot-sfh1"),
    },
    {
      key: "sfh2",
      name: "Portail SafeLink Africa",
      description: "Le portail hotspot SafeLink Africa (design Yahya WiFi).",
      previewFiles: cssOnly(loadYahyaWifiPackage()),
      alreadyAdded: templates.some((t) => t.name === "hotspot-sfh2"),
    },
  ];

  const orgBridges = session
    ? await db
        .select({
          id: bridges.id,
          name: bridges.name,
          hotspotEnabled: bridges.hotspotEnabled,
          captiveTemplateId: bridges.captiveTemplateId,
          routerName: routers.name,
        })
        .from(bridges)
        .innerJoin(routers, eq(bridges.routerId, routers.id))
        .where(eq(routers.orgId, session.orgId))
    : [];

  // Tous les routeurs de l'org — cible de l'installation DIRECTE du portail
  // (indépendante de l'auto-setup et des bridges suivis).
  const orgRouters = session
    ? await db
        .select({
          id: routers.id,
          name: routers.name,
          status: routers.status,
          captiveTemplateId: routers.captiveTemplateId,
          config: routers.lastAutoSetupConfig,
        })
        .from(routers)
        .where(eq(routers.orgId, session.orgId))
        .orderBy(asc(routers.name))
    : [];

  // Portail de chaque routeur : la colonne posée à l'installation d'abord ;
  // sinon (routeurs configurés avant ce suivi) un bridge suivi, puis le modèle
  // que l'auto-setup a nommé d'après le SSID — marqué « présumé ».
  const packages = templates.filter((t) => t.templateType === "package");
  const installed: InstalledPortal[] = [];
  const withoutPortal: { id: string; name: string }[] = [];
  for (const r of orgRouters) {
    const ssid = ((r.config ?? {}) as { ssid?: string }).ssid?.trim();
    const direct = packages.find((t) => t.id === r.captiveTemplateId);
    const viaBridge = packages.find((t) =>
      orgBridges.some((b) => b.routerName === r.name && b.captiveTemplateId === t.id),
    );
    const viaSsid = ssid ? packages.find((t) => t.name === `SafeLink Baraka — ${ssid}`) : undefined;
    const t = direct ?? viaBridge ?? viaSsid;
    const files = (t?.packageFiles as { path: string }[] | null) ?? [];
    const entry = files.find((f) => f.path === "login.html")?.path ?? files.find((f) => f.path.endsWith(".html"))?.path;
    if (t && entry) {
      installed.push({
        routerId: r.id,
        routerName: r.name,
        status: r.status,
        templateId: t.id,
        templateName: t.name,
        entry,
        token: signPreviewToken({ templateId: t.id, routerId: r.id, orgId: session!.orgId }),
        inferred: !direct,
      });
    } else {
      withoutPortal.push({ id: r.id, name: r.name });
    }
  }

  const compte: Record<string, number> = {
    routeurs: installed.length,
    modeles: templates.length,
  };
  const hrefVue = (id: string) => {
    const p = new URLSearchParams();
    if (id !== "routeurs") p.set("vue", id);
    if (retour) p.set("retour", retour);
    const q = p.toString();
    return q ? `?${q}` : "?";
  };

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up">
      {retour && (
        <Link
          href={`/admin/settings/router-setup?router=${encodeURIComponent(retour)}`}
          className="btn btn-sm btn-outline mb-4 inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          Revenir à la configuration du routeur
        </Link>
      )}
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Portail captif</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        La page que vos clients voient en se connectant au Wi-Fi : ce qui tourne sur chaque
        routeur, vos modèles, et leur installation.
      </p>

      {/* Quatre vues au lieu d'une page à rallonge : on vient ici pour UNE
          chose à la fois — vérifier, modifier, ajouter ou installer. */}
      <nav aria-label="Vues du portail captif" className="mt-6 overflow-x-auto">
        <ul className="inline-flex min-w-max gap-1 rounded-xl border border-line bg-clay/60 p-1">
          {VUES.map(({ id, label, icon: Icon }) => {
            const active = vue === id;
            return (
              <li key={id}>
                <Link
                  href={hrefVue(id)}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm ${
                    active ? "bg-paper font-semibold text-ink shadow-menu" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {label}
                  {compte[id] !== undefined && (
                    <span className="rounded-full bg-clay px-1.5 text-xs tabular-nums text-ink-soft">
                      {compte[id]}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {vue === "routeurs" && <InstalledPortals portals={installed} withoutPortal={withoutPortal} />}

      {vue === "modeles" && <TemplatesManager templates={templates} />}

      {vue === "ajouter" && (
        <>
          <DefaultPortals portals={defaultPortals} />
          <ThemeGallery existingNames={templates.map((t) => t.name)} />
        </>
      )}

      {vue === "deployer" && (
        <div id="deployer">
          <InstallOnRouter
            routers={orgRouters.map(({ id, name, status }) => ({ id, name, status }))}
            templates={packages.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault }))}
          />
          <BridgeAssignments
            bridges={orgBridges.filter((b) => b.hotspotEnabled)}
            templates={templates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault }))}
          />
        </div>
      )}
    </div>
  );
}
