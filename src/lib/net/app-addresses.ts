import { promises as dns } from "node:dns";
import { sanitizeAppAddresses } from "@/lib/mikrotik/app-ip-pin";

/**
 * Où se trouve SafeLinkHub, vu depuis SafeLinkHub.
 *
 * Sert à ANCRER l'application dans les routeurs (voir app-ip-pin.ts) : on
 * n'attend plus du routeur qu'il résolve le nom, on lui donne les adresses.
 * Le résultat est gardé quelques minutes en mémoire — les réconciliations se
 * suivent de près, et le TTL de la zone est de 5 minutes.
 *
 * En cas d'échec de résolution, on renvoie la DERNIÈRE réponse connue plutôt
 * que rien : un hoquet DNS ne doit pas dépiauter le walled-garden des routeurs
 * qui passent à ce moment-là.
 */
const TTL_MS = 5 * 60 * 1000;
let cache: { host: string; at: number; addresses: string[] } | null = null;

export async function resolveAppAddresses(host: string): Promise<string[]> {
  const cible = host.trim().toLowerCase();
  if (!cible) return [];
  // Hôte déjà littéral (déploiement par IP) : rien à résoudre.
  const direct = sanitizeAppAddresses([cible]);
  if (direct.length > 0) return direct;

  if (cache && cache.host === cible && Date.now() - cache.at < TTL_MS) return cache.addresses;
  try {
    const addresses = sanitizeAppAddresses(await dns.resolve4(cible));
    if (addresses.length > 0) cache = { host: cible, at: Date.now(), addresses };
    return addresses.length > 0 ? addresses : (cache?.host === cible ? cache.addresses : []);
  } catch {
    return cache?.host === cible ? cache.addresses : [];
  }
}
