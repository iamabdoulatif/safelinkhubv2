export const CLOUD_MIKHMON_PORT_START = 20_000;
export const CLOUD_MIKHMON_PORT_END = 20_999;

const CLOUD_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const CLOUD_BASE_DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function routerCloudSlug(name: string, routerId: string): string {
  const label =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || "router";
  const suffix = routerId.replace(/-/g, "").toLowerCase().slice(-8);
  if (!/^[a-z0-9]{8}$/.test(suffix)) {
    throw new Error("Router id cannot produce a safe cloud domain suffix.");
  }
  return `${label}-${suffix}`;
}

export function cloudMikhmonDomain(slug: string, baseDomain: string): string {
  const cleanSlug = slug.trim().toLowerCase();
  const cleanBase = baseDomain.trim().toLowerCase();
  if (!CLOUD_LABEL.test(cleanSlug)) {
    throw new Error("Cloud MikHmon domain slug is invalid.");
  }
  if (!CLOUD_BASE_DOMAIN.test(cleanBase)) {
    throw new Error("Cloud MikHmon base domain is invalid.");
  }
  return `${cleanSlug}.${cleanBase}`;
}

export function cloudMikhmonPort(usedPorts: readonly number[]): number {
  const used = new Set(usedPorts);
  for (let port = CLOUD_MIKHMON_PORT_START; port <= CLOUD_MIKHMON_PORT_END; port++) {
    if (!used.has(port)) return port;
  }
  throw new Error("No private port is available for a cloud MikHmon instance.");
}
