export type RemoteAccessControlForward = {
  id: string;
  service: string;
  publicPort: number;
  endpoint: string | null;
  expiresAt: string | null;
};

export type RemoteAccessAuditEvent = {
  id: string;
  action: string;
  createdAt: string;
};

export type RemoteAccessControlRouter = {
  id: string;
  name: string;
  status: string;
  lastSyncAt: string | null;
  connectionMethod: string;
  tunnelIp: string | null;
  ipv6BypassEnabled: boolean;
  activeForwards: RemoteAccessControlForward[];
  auditEvents: RemoteAccessAuditEvent[];
  replacementStatus: string | null;
};

export type ControlCenterFilters = {
  query: string;
  status: "all" | "online" | "attention";
  method: "all" | "wireguard" | "openvpn" | "direct";
  incidentOnly: boolean;
};

export function connectionMethodLabel(method: string) {
  if (method === "vpn") return "WireGuard";
  if (method === "openvpn") return "OpenVPN";
  return "Sans tunnel";
}

export function routerStatusLabel(status: string) {
  if (status === "online") return "En ligne";
  if (status === "pending" || status === "installing") return "Configuration requise";
  if (status === "replaced") return "Remplacé";
  return "Hors ligne";
}

export function serviceLabel(service: string) {
  const labels: Record<string, string> = {
    winbox: "WinBox",
    webfig: "WebFig",
    ssh: "SSH / SFTP",
    mikhmon: "MikHmon",
  };
  return labels[service] ?? service;
}

export function requiresAction(router: RemoteAccessControlRouter) {
  return (
    router.status === "pending" ||
    router.status === "installing" ||
    router.replacementStatus === "failed"
  );
}

export function requiresVerification(router: RemoteAccessControlRouter) {
  return !requiresAction(router) && router.status !== "online" && router.status !== "replaced";
}

export function getControlCenterMetrics(routers: RemoteAccessControlRouter[]) {
  return {
    routerCount: routers.length,
    onlineCount: routers.filter((router) => router.status === "online").length,
    activeAccessCount: routers.reduce((count, router) => count + router.activeForwards.length, 0),
    verificationCount: routers.filter(requiresVerification).length,
    actionRequiredCount: routers.filter(requiresAction).length,
  };
}

function priority(router: RemoteAccessControlRouter) {
  if (requiresAction(router)) return 0;
  if (requiresVerification(router)) return 1;
  if (router.status === "online") return 2;
  return 3;
}

export function sortControlCenterRouters(routers: RemoteAccessControlRouter[]) {
  return [...routers].sort(
    (left, right) =>
      priority(left) - priority(right) || left.name.localeCompare(right.name, "fr"),
  );
}

export function filterControlCenterRouters(
  routers: RemoteAccessControlRouter[],
  filters: ControlCenterFilters,
) {
  const needle = filters.query.trim().toLocaleLowerCase("fr");

  return sortControlCenterRouters(routers).filter((router) => {
    if (filters.status === "online" && router.status !== "online") return false;
    if (
      filters.status === "attention" &&
      !requiresAction(router) &&
      !requiresVerification(router)
    ) {
      return false;
    }
    if (filters.method === "wireguard" && router.connectionMethod !== "vpn") return false;
    if (filters.method === "openvpn" && router.connectionMethod !== "openvpn") return false;
    if (filters.method === "direct" && router.connectionMethod !== "direct") return false;
    if (filters.incidentOnly && !requiresAction(router) && !requiresVerification(router)) {
      return false;
    }
    if (!needle) return true;

    const haystack = [
      router.name,
      connectionMethodLabel(router.connectionMethod),
      ...router.activeForwards.flatMap((forward) => [
        serviceLabel(forward.service),
        forward.endpoint ?? "",
      ]),
    ]
      .join(" ")
      .toLocaleLowerCase("fr");
    return haystack.includes(needle);
  });
}
