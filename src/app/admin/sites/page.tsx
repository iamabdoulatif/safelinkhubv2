import { Building2 } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { listSites, listOrgRoutersWithSite } from "@/lib/org/sites";
import SitesManager from "./SitesManager";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const session = await getSession();
  /* La capacité, pas le rôle : même règle que les actions serveur, donc l'écran
     ne montre pas ce qu'elles refuseront. */
  if (!session || !can(session.role, "routers")) {
    return (
      <p className="text-sm text-ink-soft">
        Seuls les gestionnaires du parc peuvent organiser les sites.
      </p>
    );
  }

  const [sites, routeurs] = await Promise.all([
    listSites(session.orgId),
    listOrgRoutersWithSite(session.orgId),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="flex items-center gap-2 text-ink text-2xl font-semibold tracking-tight">
        <Building2 className="h-5 w-5" />
        Sites &amp; agences
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Regroupez vos routeurs par agence ou succursale. C&apos;est la base des
        services réseau d&apos;entreprise (interconnexion, supervision par site).
      </p>
      <SitesManager sites={sites} routeurs={routeurs} />
    </div>
  );
}
