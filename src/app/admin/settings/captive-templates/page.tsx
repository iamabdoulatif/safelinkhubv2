import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bridges, routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { listCaptiveTemplates } from "@/lib/captive-templates/actions";
import TemplatesManager from "./TemplatesManager";
import BridgeAssignments from "./BridgeAssignments";
import ThemeGallery from "./ThemeGallery";

export default async function CaptiveTemplatesPage() {
  const session = await getSession();
  const db = getDb();

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

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up">
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
    </div>
  );
}
