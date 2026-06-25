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
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-2">
        <Globe className="h-5 w-5 text-slate-700" />
        <h1 className="text-2xl font-bold text-slate-900">Mikhmon Online</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        MikHmon est exposé directement depuis chaque routeur via son nom DDNS MikroTik
        Cloud (configuré par l&apos;auto-setup) — pas via le relais SafeLinkHub. Cliquez
        sur « Obtenir le lien » pour récupérer l&apos;adresse actuelle et ouvrir
        l&apos;interface de gestion des vouchers.
      </p>

      <MikhmonOnlineList
        routers={allRouters.map((r) => ({ id: r.id, name: r.name, status: r.status }))}
      />
    </div>
  );
}
