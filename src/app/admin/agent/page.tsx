import { eq } from "drizzle-orm";
import { UserCog } from "lucide-react";
import { getDb } from "@/lib/db";
import { packages } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { listAgentsWithStats } from "@/lib/agents/actions";
import AgentList from "./AgentList";
import AddAgentModal from "./AddAgentModal";

export default async function AgentPage() {
  const session = await getSession();
  const db = getDb();

  const agents = await listAgentsWithStats();

  const orgPackages = session
    ? await db
        .select({
          id: packages.id,
          name: packages.name,
          priceCents: packages.priceCents,
          commissionCents: packages.commissionCents,
          active: packages.active,
        })
        .from(packages)
        .where(eq(packages.orgId, session.orgId))
    : [];

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-slate-700" />
            <h1 className="text-2xl font-bold text-slate-900">Agent</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Vendez des forfaits internet en espèces via votre équipe — chaque vente
            génère un voucher et crédite automatiquement le solde flottant.
          </p>
        </div>
        <AddAgentModal />
      </div>

      <AgentList agents={agents} packages={orgPackages} />
    </div>
  );
}
