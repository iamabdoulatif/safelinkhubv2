import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bridges, routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { listCaptiveTemplates } from "@/lib/captive-templates/actions";
import TemplatesManager from "./TemplatesManager";
import BridgeAssignments from "./BridgeAssignments";

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
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-900">
        Modèles de portail captif
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Personnalisez l&apos;apparence de la page que vos clients voient en se
        connectant au Wi-Fi (logo, couleurs, textes), puis assignez un modèle
        à chaque bridge hotspot.
      </p>

      <TemplatesManager templates={templates} />

      <BridgeAssignments
        bridges={orgBridges.filter((b) => b.hotspotEnabled)}
        templates={templates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault }))}
      />
    </div>
  );
}
