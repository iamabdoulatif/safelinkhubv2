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
import { buildMikhmonConfigPhp } from "./mikhmon-session";

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

/* Le relais exécute ces commandes sous le compte `relay`, qui n'appartient PAS
   au groupe docker : `docker …` y échoue par « permission denied … docker.sock ».
   Il a en revanche sudo sans mot de passe, comme le reste des commandes
   privilégiées du relais (`sudo wg show`, `sudo bash -s`). On passe donc par
   sudo ici aussi, plutôt que d'ajouter `relay` au groupe docker : cela lui
   ouvrirait un second chemin vers root, permanent et silencieux, alors que
   sudo laisse une trace dans les journaux. */
const DOCKER = "sudo docker";

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


/** Nom de session affiché dans MikHmon — le même que sur les routeurs à conteneur. */
export const CLOUD_SESSION_NAME = "SafeLinkHub";

/**
 * Pose la session MikHmon dans le conteneur du relais.
 *
 * L'image ne sait pas se pré-remplir : sans cette écriture, l'exploitant tombe
 * sur « Nouveau routeur » et doit ressaisir à la main l'IP, le compte API, le
 * nom du hotspot et le DNS — que SafeLinkHub connaît déjà. C'est exactement ce
 * que fait déjà l'auto-setup des routeurs à conteneur ; on réutilise SON
 * constructeur (buildMikhmonConfigPhp) pour que les deux chemins ne puissent
 * pas diverger, mot de passe chiffré compris.
 *
 * Le fichier transite en base64 : le PHP produit contient des apostrophes et
 * des dollars, qu'un here-doc de shell mal cité corromprait en silence.
 */
async function writeCloudMikhmonSession(
  run: CloudRunner,
  containerName: string,
  router: CloudRouter,
): Promise<void> {
  const contenu = buildMikhmonConfigPhp(CLOUD_SESSION_NAME, {
    // L'instance vit sur le relais : elle joint le routeur par son IP de
    // tunnel, jamais par l'adresse du hotspot (injoignable depuis le VPS).
    ip: router.tunnelIp,
    user: router.username,
    pass: router.password,
    hotspot: router.hotspotName,
    dns: router.dnsName,
    currency: "fcfa",
    autoload: 10,
    iface: 1,
    infolp: "",
    idle: "disable",
    livereport: "enable",
  });
  const b64 = Buffer.from(contenu, "utf8").toString("base64");
  await run(
    `${DOCKER} exec ${shellArg(containerName)} sh -c ${shellArg(
      `echo ${b64} | base64 -d > /src/src/include/config.php`,
    )}`,
  );
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
  /* Une instance déjà là est REPOSÉE, pas seulement redémarrée : la session est
     réécrite depuis la base à chaque activation. C'est ce qui donne au bouton
     sa valeur de réparation — une instance créée avant ce correctif, ou dont
     quelqu'un a cassé les réglages à la main, revient d'un clic. Les valeurs
     viennent de SafeLinkHub, seule source de vérité pour ce routeur. */
  if (input.existing) {
    if (input.existing.status !== "active") {
      await input.run(`${DOCKER} start ${shellArg(input.existing.containerName)}`);
    }
    await writeCloudMikhmonSession(input.run, input.existing.containerName, input.router);
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
    `${DOCKER} run -d`,
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
    /* AUCUNE variable MIKHMON_MT_* ici. Mesuré dans l'image : les seules
       variables qu'elle lit sont MIKHMON_{BUILD_STAMP,BUILD_VERSION,
       FRAUD_API_KEY,IMAGE_NAME,SECRET_KEY,UPDATE_CHECK,UPDATE_URL}. Les sept
       autres qu'on envoyait ne servaient à rien — et l'une d'elles portait le
       mot de passe du routeur EN CLAIR dans la sortie de `docker inspect`.
       La session se pose par config.php, juste après. */
    shellArg(image),
  ];
  await input.run(args.join(" "));
  await writeCloudMikhmonSession(input.run, containerName, input.router);

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
    /* Délai TAILLÉ POUR LE TIRAGE DE L'IMAGE. `runOnRelay` coupe à 15 s par
       défaut, ce qui suffit aux commandes de lecture du relais mais pas à un
       `docker run` qui doit d'abord télécharger MikHmon : la première
       activation d'un relais dont le cache est vide dépasse ce délai, et
       l'application déclarerait l'échec pendant que le conteneur, lui,
       finirait de se créer. */
    run: (command) => runOnRelay(command, 180_000),
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

  await runOnRelay(`${DOCKER} rm -f ${shellArg(existing.containerName)}`);
  await db.delete(routerMikhmonCloudInstances).where(eq(routerMikhmonCloudInstances.id, existing.id));
  return true;
}
