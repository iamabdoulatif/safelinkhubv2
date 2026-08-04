import Link from "next/link";
import { after } from "next/server";
import { ArrowLeft } from "lucide-react";
import { asc, eq } from "drizzle-orm";
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

// PackagePreview ne lit que le schéma de couleurs des CSS — on n'envoie donc que
// les .css au client pour l'aperçu, pas les images base64 du package entier.
const cssOnly = (files: PackageFile[]) =>
  files.filter((f) => f.path.endsWith(".css") && f.encoding === "utf8");

export default async function CaptiveTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ retour?: string }>;
}) {
  const session = await getSession();
  const db = getDb();
  // "?retour=<routerId>" : l'admin est arrivé ici depuis l'étape « Portail
  // captif » du wizard de configuration routeur — offre le chemin inverse
  // vers ce même wizard, sinon il n'a aucun lien pour y retourner après
  // avoir importé/choisi son portail.
  const { retour } = await searchParams;

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
        .select({ id: routers.id, name: routers.name, status: routers.status })
        .from(routers)
        .where(eq(routers.orgId, session.orgId))
        .orderBy(asc(routers.name))
    : [];

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up">
      {retour && (
        <Link
          href={`/admin/settings/router-setup?router=${encodeURIComponent(retour)}`}
          className="mb-4 inline-flex items-center gap-1.5 rounded-md border border-line-soft bg-clay px-3 py-1.5 text-sm font-medium text-ink hover:border-ok"
        >
          <ArrowLeft className="h-4 w-4" />
          Revenir à la configuration du routeur
        </Link>
      )}
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
        Portail captif
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Personnalisez l&apos;apparence de la page que vos clients voient en se
        connectant au Wi-Fi (logo, couleurs, textes), puis assignez un modèle
        à chaque bridge hotspot.
      </p>

      <DefaultPortals portals={defaultPortals} />

      <ThemeGallery existingNames={templates.map((t) => t.name)} />

      <TemplatesManager templates={templates} />

      <BridgeAssignments
        bridges={orgBridges.filter((b) => b.hotspotEnabled)}
        templates={templates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault }))}
      />

      <InstallOnRouter
        routers={orgRouters}
        templates={templates
          .filter((t) => t.templateType === "package")
          .map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault }))}
      />
    </div>
  );
}
