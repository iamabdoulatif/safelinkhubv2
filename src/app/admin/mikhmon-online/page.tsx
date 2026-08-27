import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerMikhmonCloudInstances, routerPortForwards, routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { relayWebUrl } from "@/lib/mikrotik/relay";
import { supportsContainersFor } from "@/lib/mikrotik/device-catalog";
import MikhmonOnlineConsole, { type MikhmonRouter } from "./MikhmonOnlineList";

/* Station MikHmon Online.
 *
 * L'écran précédent était une liste plate : un bouton « Obtenir le lien » par
 * routeur, et RIEN d'affiché tant qu'on n'avait pas cliqué — y compris le
 * domaine dédié, qui est pourtant l'objet même de la fonctionnalité et qui
 * dort déjà en base. La page est donc informative au chargement, et ne garde
 * derrière un bouton que ce qui coûte vraiment : la sonde qui ouvre une
 * connexion vers le routeur pour lire son DDNS.
 *
 * Le parc se sépare en trois, parce que MikHmon n'y vit pas au même endroit :
 *
 *   sans conteneur  → instance MikHmon hébergée sur le relais, joignable sur
 *                     son propre sous-domaine HTTPS ; le routeur ne reçoit ni
 *                     conteneur ni NAT ;
 *   avec conteneur  → MikHmon tourne sur le routeur lui-même, joint par DDNS,
 *                     tunnel ou réseau local ;
 *   capacité inconnue → `supports_containers` vaut NULL. Ce n'est pas un cas
 *                     théorique : la colonne n'est écrite qu'à un auto-setup
 *                     réussi, donc tout routeur lié avant elle y reste tant
 *                     qu'on ne relance pas sa configuration. On le dit, plutôt
 *                     que de le ranger d'office dans l'une des deux familles.
 */
export default async function MikhmonOnlinePage() {
  const session = await getSession();
  if (!session) return null;

  const db = getDb();
  const [parc, instances, forwards] = await Promise.all([
    db
      .select({
        id: routers.id,
        name: routers.name,
        status: routers.status,
        model: routers.model,
        supportsContainers: routers.supportsContainers,
        connectionMethod: routers.connectionMethod,
        tunnelIp: routers.tunnelIp,
        relayShard: routers.relayShard,
      })
      .from(routers)
      .where(eq(routers.orgId, session.orgId))
      .orderBy(desc(routers.createdAt)),
    db
      .select({
        routerId: routerMikhmonCloudInstances.routerId,
        domain: routerMikhmonCloudInstances.domain,
        status: routerMikhmonCloudInstances.status,
      })
      .from(routerMikhmonCloudInstances),
    db
      .select({ routerId: routerPortForwards.routerId, publicPort: routerPortForwards.publicPort })
      .from(routerPortForwards)
      .where(
        and(eq(routerPortForwards.service, "mikhmon"), eq(routerPortForwards.status, "active")),
      ),
  ]);

  const instanceParRouteur = new Map(instances.map((i) => [i.routerId, i]));
  const forwardParRouteur = new Map(forwards.map((f) => [f.routerId, f.publicPort]));

  const zones: MikhmonRouter[] = parc.map((r) => {
    const instance = instanceParRouteur.get(r.id) ?? null;
    const port = forwardParRouteur.get(r.id) ?? null;
    return {
      id: r.id,
      name: r.name,
      status: r.status,
      model: r.model,
      connectionMethod: r.connectionMethod,
      tunnelIp: r.tunnelIp,
      kind: (() => {
        const capable = supportsContainersFor(r.supportsContainers, r.model);
        return capable === false ? "cloud" : capable === true ? "container" : "unknown";
      })(),
      cloudDomain: instance?.status === "active" ? instance.domain : null,
      // Le lien tunnel se calcule sans joindre le routeur : le shard et le
      // port suffisent. Aucune raison de le cacher derrière un clic.
      tunnelLink: port ? relayWebUrl(r.relayShard, port) : null,
    };
  });

  return (
    <MikhmonOnlineConsole
      routers={zones}
      superadmin={isSuperAdmin(session.role)}
      baseDomain={process.env.MIKHMON_CLOUD_BASE_DOMAIN}
    />
  );
}
