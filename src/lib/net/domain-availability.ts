"use server";

import { promises as dns } from "node:dns";
import { getSession } from "@/lib/auth/session";

export type DomainStatus = "free" | "taken" | "unknown";

/**
 * Ce domaine appartient-il déjà à quelqu'un sur internet ?
 *
 * POURQUOI ÇA COMPTE : le domaine du portail est résolu par le DNS du MikroTik,
 * donc un nom déjà déposé FONCTIONNE quand même — mais il masque le vrai site
 * pour tous les clients du hotspot. Choisir « orange.ci » rendrait Orange
 * inaccessible depuis ce réseau. C'est un avertissement, pas un blocage :
 * l'exploitant peut légitimement utiliser un domaine qu'il possède.
 *
 * RDAP d'abord (le registre fait foi : 404 = non déposé), DNS en repli car
 * beaucoup de ccTLD — dont .ci — n'exposent pas de service RDAP.
 */
export async function checkDomainTaken(
  domain: string,
): Promise<{ domain: string; status: DomainStatus }> {
  const session = await getSession();
  if (!session) return { domain, status: "unknown" };

  const clean = domain.trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) return { domain, status: "unknown" };

  // RDAP ne connaît que le domaine enregistrable : « 1.namoin.ci » se dépose
  // sous « namoin.ci ».
  const labels = clean.split(".");
  const registrable = labels.slice(-2).join(".");

  // RDAP ne sert QUE de signal positif. Un 404 ne veut pas dire « libre » : la
  // plupart des ccTLD, dont .ci, n'ont pas de service RDAP et répondent 404
  // même pour un domaine déposé — orange.ci passait ainsi pour disponible.
  try {
    const rdap = await fetch(`https://rdap.org/domain/${registrable}`, {
      signal: AbortSignal.timeout(6000),
      headers: { accept: "application/rdap+json" },
    });
    if (rdap.ok) return { domain, status: "taken" };
  } catch {
    // Registre injoignable : le DNS tranche.
  }

  // Ce qui compte vraiment pour un portail captif : est-ce que ce nom pointe
  // déjà quelque part ? Si oui, l'utiliser masquerait le vrai site aux clients
  // du hotspot. Sinon, il ne masque rien — donc utilisable.
  try {
    await dns.resolve(registrable);
    return { domain, status: "taken" };
  } catch {
    return { domain, status: "free" };
  }
}
