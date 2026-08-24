import { eq } from "drizzle-orm";
import { ArrowRightLeft } from "lucide-react";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import {
  listMyPendingTransfers,
  listTransferRequests,
} from "@/lib/mikrotik/router-transfer-actions";
import TransfersManager from "./TransfersManager";

export const dynamic = "force-dynamic";

export default async function RouterTransfersPage() {
  const session = await getSession();
  if (!session) return null;

  const superadmin = isSuperAdmin(session.role);
  const peutDemander = can(session.role, "routers");

  const [parc, miennes, file] = await Promise.all([
    peutDemander
      ? getDb()
          .select({ id: routers.id, name: routers.name, model: routers.model })
          .from(routers)
          .where(eq(routers.orgId, session.orgId))
      : [],
    listMyPendingTransfers(),
    // Rend [] pour un non-superadmin : la garde vit dans l'action, pas
    // seulement dans la page.
    listTransferRequests(),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
        <ArrowRightLeft className="h-5 w-5" />
        Transfert de routeur
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Confier un MikroTik à un autre compte SafeLinkHub, sans toucher à l&apos;historique de ventes.
      </p>
      <TransfersManager
        routeurs={peutDemander ? parc : []}
        miennes={miennes}
        file={file}
        superadmin={superadmin}
      />
    </div>
  );
}
