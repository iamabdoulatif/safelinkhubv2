import { routers } from "@/lib/db/schema";

/** Champs exposés à l'app : jamais d'identifiants ni de mot de passe du routeur. */
export const ROUTER_FIELDS = {
  id: routers.id,
  name: routers.name,
  model: routers.model,
  status: routers.status,
  connectionMethod: routers.connectionMethod,
  tunnelIp: routers.tunnelIp,
  activeUsers: routers.activeUsers,
  cpuLoad: routers.cpuLoad,
  memoryUsage: routers.memoryUsage,
  uptimeSeconds: routers.uptimeSeconds,
  lastSyncAt: routers.lastSyncAt,
};
