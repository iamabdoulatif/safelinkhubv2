import Link from "next/link";
import { after } from "next/server";
import { ArrowLeft } from "lucide-react";
import { and, asc, eq } from "drizzle-orm";
import { MonitorSmartphone, Layers, Plus, Send } from "lucide-react";
import { getDb } from "@/lib/db";
import { bridges, packages, routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { refreshStaleRouters } from "@/lib/mikrotik/router-sync";
import { listCaptiveTemplates } from "@/lib/captive-templates/actions";
import {
  loadSafelinkhubDefaultPackage,
  loadYahyaWifiPackage,
  type PackageFile,
  type PackageVendor,
} from "@/lib/captive-templates/package-files";
import TemplatesManager from "./TemplatesManager";
import DefaultPortals, { type DefaultPortal } from "./DefaultPortals";
import BridgeAssignments from "./BridgeAssignments";
import InstallOnRouter from "./InstallOnRouter";
import ThemeGallery from "./ThemeGallery";
import InstalledPortals, { type RouterPortal } from "./InstalledPortals";
import { signPreviewToken } from "@/lib/captive-templates/preview-token";
import { pickRouterPortal, routerSsid } from "@/lib/captive-templates/router-portal";
import { formatDurationHuman } from "@/lib/vouchers/expiry";

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
          routerId: bridges.routerId,
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
          supportWhatsapp: routers.portalSupportWhatsapp,
          supportPhone: routers.portalSupportPhone,
          vendors: routers.portalVendors,
        })
        .from(routers)
        .where(eq(routers.orgId, session.orgId))
        .orderBy(asc(routers.name))
    : [];

  // Portail de chaque routeur : la colonne posée à l'installation d'abord ;
  // sinon (routeurs configurés avant ce suivi) un bridge suivi, puis le modèle
  // que l'auto-setup a nommé d'après le SSID — marqué « présumé ».
  const packageTemplates = templates.filter((t) => t.templateType === "package");
  // Forfaits actifs, pour la section « Forfaits affichés » de chaque routeur.
  const orgPackages = session
    ? await db
        .select({
          id: packages.id,
          name: packages.name,
          priceCents: packages.priceCents,
          durationValue: packages.durationValue,
          durationUnit: packages.durationUnit,
          routerId: packages.routerId,
        })
        .from(packages)
        .where(and(eq(packages.orgId, session.orgId), eq(packages.active, true)))
        .orderBy(asc(packages.priceCents))
    : [];

  const items: RouterPortal[] = orgRouters.map((r) => {
    const picked = pickRouterPortal(
      { id: r.id, captiveTemplateId: r.captiveTemplateId, ssid: routerSsid(r.config) },
      packageTemplates,
      orgBridges,
    );
    const t = picked?.template;
    const files = (t?.packageFiles as { path: string }[] | null) ?? [];
    const entry = files.find((f) => f.path === "login.html")?.path ?? files.find((f) => f.path.endsWith(".html"))?.path;
    return {
      routerId: r.id,
      routerName: r.name,
      status: r.status,
      portal:
        t && entry
          ? {
              templateId: t.id,
              templateName: t.name,
              entry,
              token: signPreviewToken({ templateId: t.id, routerId: r.id, orgId: session!.orgId }),
              inferred: picked.inferred,
            }
          : null,
      contacts: {
        supportWhatsapp: r.supportWhatsapp ?? "",
        supportPhone: r.supportPhone ?? "",
        vendors: Array.isArray(r.vendors) ? (r.vendors as PackageVendor[]) : [],
      },
      plans: orgPackages
        .filter((p) => p.routerId === r.id || p.routerId === null)
        .map((p) => ({
          id: p.id,
          name: p.name,
          priceCents: p.priceCents,
          validity: formatDurationHuman({ durationValue: p.durationValue, durationUnit: p.durationUnit, billingStartsOn: "Upon First Use" }),
          shared: p.routerId === null,
        })),
    };
  });

  const compte: Record<string, number> = {
    routeurs: items.filter((i) => i.portal).length,
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

      {vue === "routeurs" && (
        <InstalledPortals
          items={items}
          templates={packageTemplates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault }))}
        />
      )}

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
            templates={packageTemplates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault }))}
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
