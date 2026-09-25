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
 * MikHmon Online est hébergé sur le relais, peu importe la capacité Container
 * du routeur. Une éventuelle installation locale reste simplement un accès
 * secondaire ; elle ne change ni l'éligibilité ni la destination cloud.
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
        edition: routerMikhmonCloudInstances.edition,
        localPort: routerMikhmonCloudInstances.localPort,
      })
      .from(routerMikhmonCloudInstances),
    db
      .select({
        routerId: routerPortForwards.routerId,
        publicPort: routerPortForwards.publicPort,
        targetPort: routerPortForwards.targetPort,
      })
      .from(routerPortForwards)
      .where(
        and(eq(routerPortForwards.service, "mikhmon"), eq(routerPortForwards.status, "active")),
      ),
  ]);

  const instanceParRouteur = new Map(instances.map((i) => [i.routerId, i]));
  const forwardsParRouteur = new Map<string, (typeof forwards)[number][]>();
  for (const forward of forwards) {
    forwardsParRouteur.set(forward.routerId, [...(forwardsParRouteur.get(forward.routerId) ?? []), forward]);
  }

  const zones: MikhmonRouter[] = parc.map((r) => {
    const instance = instanceParRouteur.get(r.id) ?? null;
    const localForward = (forwardsParRouteur.get(r.id) ?? []).find(
      (forward) => forward.targetPort !== instance?.localPort,
    );
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
      /* L'adresse est remontée QUEL QUE SOIT l'état, avec l'état à côté.
         Ne montrer que les instances actives faisait disparaître de l'écran
         celle qu'on venait de désactiver — donc tout moyen de la rallumer. */
      cloudDomain: instance?.domain ?? null,
      cloudStatus: instance?.status ?? null,
      cloudEdition: instance?.edition ?? null,
      // Le lien tunnel se calcule sans joindre le routeur : le shard et le
      // port suffisent. Aucune raison de le cacher derrière un clic.
      tunnelLink: localForward ? relayWebUrl(r.relayShard, localForward.publicPort) : null,
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
