import { eq, desc } from "drizzle-orm";
import { Globe } from "lucide-react";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import MikhmonOnlineList from "./MikhmonOnlineList";

export default async function MikhmonOnlinePage() {
  const session = await getSession();
  const db = getDb();

  const allRouters = session
    ? await db
        .select()
        .from(routers)
        .where(eq(routers.orgId, session.orgId))
        .orderBy(desc(routers.createdAt))
    : [];

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
      <div className="flex items-center gap-2">
        <Globe className="h-5 w-5 text-ink" />
        <h1 className="text-2xl font-bold text-ink">Mikhmon Online</h1>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Les routeurs compatibles Container exposent MikHmon depuis leur propre
        équipement. Les RB951 et autres modèles incompatibles reçoivent une instance
        MikHmon Online dédiée, hébergée via le relais SafeLinkHub et accessible en HTTPS
        sans installer de conteneur sur le routeur.
      </p>

      <MikhmonOnlineList
        routers={allRouters.map((r) => ({ id: r.id, name: r.name, status: r.status }))}
      />
    </div>
  );
}
