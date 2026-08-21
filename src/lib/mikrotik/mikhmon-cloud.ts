import {
  cloudMikhmonDomain,
  cloudMikhmonPort,
  routerCloudSlug,
} from "./mikhmon-cloud-domain";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerMikhmonCloudInstances } from "@/lib/db/schema";
import { decryptSecret } from "./crypto";
import { runOnRelay } from "./relay";

type CloudRouter = {
  id: string;
  name: string;
  tunnelIp: string;
  username: string;
  password: string;
  hotspotName: string;
  dnsName: string;
};

type ExistingCloudInstance = {
  domain: string;
  containerName: string;
  localPort: number;
  status: string;
};

type CloudRunner = (command: string) => Promise<string>;

export type CloudMikhmonInstance = {
  domain: string;
  containerName: string;
  localPort: number;
  status: "active";
};

const CLOUD_DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function shellArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function containerNameFor(routerId: string): string {
  const compactId = routerId.replace(/-/g, "").toLowerCase();
  if (!/^[a-z0-9]{16,64}$/.test(compactId)) {
    throw new Error("Router id cannot produce a safe cloud container name.");
  }
  return `slh-mikhmon-${compactId}`;
}

export async function provisionCloudMikhmon(input: {
  router: CloudRouter;
  existing: ExistingCloudInstance | null;
  usedPorts: readonly number[];
  baseDomain: string;
  image?: string;
  /** Réseau Docker où Traefik découvre les conteneurs. */
  traefikNetwork?: string;
  run: CloudRunner;
}): Promise<CloudMikhmonInstance> {
  if (input.existing?.status === "active") {
    return {
      domain: input.existing.domain,
      containerName: input.existing.containerName,
      localPort: input.existing.localPort,
      status: "active",
    };
  }

  if (input.existing) {
    await input.run(`docker start ${shellArg(input.existing.containerName)}`);
    return {
      domain: input.existing.domain,
      containerName: input.existing.containerName,
      localPort: input.existing.localPort,
      status: "active",
    };
  }

  const slug = routerCloudSlug(input.router.name, input.router.id);
  const domain = cloudMikhmonDomain(slug, input.baseDomain);
  const localPort = cloudMikhmonPort(input.usedPorts);
  const containerName = containerNameFor(input.router.id);
  const image = input.image ?? "latif225/mikhmon-sf-v1:latest";

  /* Le TLS des sous-domaines est terminé par TRAEFIK, pas par nginx.
   *
   * Le relais fait tourner les deux : nginx sert les redirections sur des
   * ports hauts, Traefik détient 80 et 443. Un vhost nginx en `listen 443`
   * ne pourrait donc jamais se lier — et comme la synchro écrit UN SEUL
   * fichier pour toutes les redirections, un vhost invalide y ferait échouer
   * `nginx -t` et gèlerait la mise à jour de l'ensemble.
   *
   * Traefik, lui, détient déjà le port ET le certificat joker de
   * *.mikhmon.safelinkhub.io, qu'il renouvelle seul via Cloudflare DNS-01.
   * On épingle `tls.domains` sur ce joker plutôt que de laisser le résolveur
   * demander un certificat par routeur : à l'échelle du parc, les quotas
   * Let's Encrypt seraient atteints en quelques dizaines d'instances.
   *
   * La publication sur 127.0.0.1 est conservée : elle ne coûte rien, donne un
   * chemin de diagnostic local et garde son sens à la colonne local_port. */
  /* Le domaine part dans une règle Host() de Traefik et dans un label Docker.
     cloudMikhmonDomain l'a déjà validé, mais la garde reste explicite ici :
     elle vivait dans le vhost nginx qu'on vient de retirer, et une validation
     supprimée « parce qu'elle semblait redondante » est exactement ce qui
     laisse passer une injection le jour où l'appelant change. */
  if (!CLOUD_DOMAIN.test(domain)) {
    throw new Error("Cloud MikHmon instance has an invalid domain.");
  }
  const routerLabel = `mikhmon-${containerNameFor(input.router.id).replace("slh-mikhmon-", "")}`;
  const traefikNetwork = input.traefikNetwork ?? "safelink_safelink_net";
  const args = [
    "docker run -d",
    `--name ${shellArg(containerName)}`,
    "--restart unless-stopped",
    `--network ${shellArg(traefikNetwork)}`,
    `--publish ${shellArg(`127.0.0.1:${localPort}:80`)}`,
    `--label ${shellArg("traefik.enable=true")}`,
    `--label ${shellArg(`traefik.docker.network=${traefikNetwork}`)}`,
    `--label ${shellArg(`traefik.http.routers.${routerLabel}.rule=Host(\`${domain}\`)`)}`,
    `--label ${shellArg(`traefik.http.routers.${routerLabel}.entrypoints=websecure`)}`,
    `--label ${shellArg(`traefik.http.routers.${routerLabel}.tls=true`)}`,
    `--label ${shellArg(`traefik.http.routers.${routerLabel}.tls.certresolver=cloudflare`)}`,
    `--label ${shellArg(`traefik.http.routers.${routerLabel}.tls.domains[0].main=${input.baseDomain}`)}`,
    `--label ${shellArg(`traefik.http.routers.${routerLabel}.tls.domains[0].sans=*.${input.baseDomain}`)}`,
    `--label ${shellArg(`traefik.http.services.${routerLabel}.loadbalancer.server.port=80`)}`,
    `--env ${shellArg("MIKHMON_SESSION=SafeLinkHub")}`,
    `--env ${shellArg(`MIKHMON_MT_IP=${input.router.tunnelIp}`)}`,
    `--env ${shellArg(`MIKHMON_MT_USER=${input.router.username}`)}`,
    `--env ${shellArg(`MIKHMON_MT_PASS=${input.router.password}`)}`,
    `--env ${shellArg(`MIKHMON_HOTSPOT_NAME=${input.router.hotspotName}`)}`,
    `--env ${shellArg(`MIKHMON_DNS=${input.router.dnsName}`)}`,
    `--env ${shellArg("MIKHMON_CURRENCY=fcfa")}`,
    shellArg(image),
  ];
  await input.run(args.join(" "));

  return { domain, containerName, localPort, status: "active" };
}

type CloudRouterRecord = {
  id: string;
  name: string;
  tunnelIp: string | null;
  username: string | null;
  passwordEncrypted: string | null;
  lastAutoSetupConfig: unknown;
};

function cloudSessionFromRouter(router: CloudRouterRecord): CloudRouter {
  const baseDomain = process.env.MIKHMON_CLOUD_BASE_DOMAIN;
  if (!baseDomain) throw new Error("MIKHMON_CLOUD_BASE_DOMAIN is not configured.");
  if (!router.tunnelIp) throw new Error("Router has no active VPN tunnel for cloud MikHmon.");
  if (!router.username || !router.passwordEncrypted) {
    throw new Error("Router is missing API credentials for cloud MikHmon.");
  }
  const config = (router.lastAutoSetupConfig ?? {}) as {
    hotspotName?: string;
    dnsName?: string;
    hotspotAddress?: string;
  };
  return {
    id: router.id,
    name: router.name,
    tunnelIp: router.tunnelIp,
    username: router.username,
    password: decryptSecret(router.passwordEncrypted),
    hotspotName: config.hotspotName?.trim() || router.name,
    dnsName: config.dnsName?.trim() || config.hotspotAddress?.trim() || router.name,
  };
}

/** Starts or resumes the one cloud instance owned by a legacy router. */
export async function ensureCloudMikhmonInstance(router: CloudRouterRecord) {
  const baseDomain = process.env.MIKHMON_CLOUD_BASE_DOMAIN;
  if (!baseDomain) throw new Error("MIKHMON_CLOUD_BASE_DOMAIN is not configured.");

  const db = getDb();
  const [existing] = await db
    .select()
    .from(routerMikhmonCloudInstances)
    .where(eq(routerMikhmonCloudInstances.routerId, router.id))
    .limit(1);
  const rows = await db
    .select({ localPort: routerMikhmonCloudInstances.localPort })
    .from(routerMikhmonCloudInstances);
  const instance = await provisionCloudMikhmon({
    router: cloudSessionFromRouter(router),
    existing,
    usedPorts: rows.map((row) => row.localPort),
    baseDomain,
    image: process.env.MIKHMON_CLOUD_IMAGE,
    run: runOnRelay,
  });

  if (existing) {
    await db
      .update(routerMikhmonCloudInstances)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(routerMikhmonCloudInstances.id, existing.id));
    return instance;
  }

  await db.insert(routerMikhmonCloudInstances).values({ routerId: router.id, ...instance });
  return instance;
}

/** Removes the VPS container before deleting the state that exposes it. */
export async function removeCloudMikhmonInstance(routerId: string): Promise<boolean> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(routerMikhmonCloudInstances)
    .where(eq(routerMikhmonCloudInstances.routerId, routerId))
    .limit(1);
  if (!existing) return false;

  await runOnRelay(`docker rm -f ${shellArg(existing.containerName)}`);
  await db.delete(routerMikhmonCloudInstances).where(eq(routerMikhmonCloudInstances.id, existing.id));
  return true;
}
