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

  const args = [
    "docker run -d",
    `--name ${shellArg(containerName)}`,
    "--restart unless-stopped",
    `--publish ${shellArg(`127.0.0.1:${localPort}:80`)}`,
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
