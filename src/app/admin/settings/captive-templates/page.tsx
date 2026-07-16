import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bridges, routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { listCaptiveTemplates } from "@/lib/captive-templates/actions";
import TemplatesManager from "./TemplatesManager";
import BridgeAssignments from "./BridgeAssignments";
import InstallOnRouter from "./InstallOnRouter";
import ThemeGallery from "./ThemeGallery";

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

  const templates = await listCaptiveTemplates();

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
