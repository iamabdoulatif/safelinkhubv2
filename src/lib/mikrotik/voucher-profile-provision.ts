// Crée un profil voucher hotspot sur un routeur À LA DEMANDE s'il n'existe pas
// déjà — utilisé quand on vend un forfait dont le profil n'a pas été provisionné
// à l'auto-setup (ex. forfait ajouté après). Reproduit EXACTEMENT les commandes
// de provisionHotspotStack (container-setup.ts) : profil + planificateur de
// balayage d'expiration. Module serveur uniquement.

import type { RouterOSClient } from "./client";
import { HOTSPOT_POOL_NAME } from "./constants";
import type { VoucherProfile } from "./voucher-profiles";

/**
 * Garantit que `profile` existe sur le routeur. Idempotent et NON destructif :
 * si un profil du même nom est déjà là, on ne touche à rien (on ne veut pas
 * perturber les vouchers en cours). Lève si la création échoue (l'appelant
 * décide de la gravité).
 */
export async function ensureVoucherProfileOnRouter(
  client: RouterOSClient,
  profile: VoucherProfile,
  timeoutMs = 20000,
): Promise<void> {
  const existing = await client
    .talk(["/ip/hotspot/user/profile/print", `?name=${profile.name}`], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  if (existing.length > 0) return;

  const createProfile = [
    "/ip/hotspot/user/profile/add",
    `=name=${profile.name}`,
    `=address-pool=${HOTSPOT_POOL_NAME}`,
    "=parent-queue=none",
    "=add-mac-cookie=yes",
  ];
  // Un profil ILLIMITÉ n'a pas d'`on-login` : c'est ce script qui planifie la
  // suppression du compte à l'échéance. Sans lui, rien n'expire — ce qui est
  // exactement le but pour un administrateur ou un technicien de zone.
  if (!profile.unlimited) createProfile.push(`=on-login=${profile.onLogin}`);
  if (profile.rateLimit) createProfile.push(`=rate-limit=${profile.rateLimit}`);
  await client.talk(createProfile, timeoutMs);

  // …et pas de planificateur de balayage non plus : c'est le second mécanisme
  // qui efface les comptes périmés. En poser un pour un profil sans expiration
  // serait au mieux inutile, au pire un risque de suppression accidentelle.
  if (profile.unlimited) return;

  await client
    .talk(["/system/scheduler/remove", `=numbers=${profile.name}`], timeoutMs)
    .catch(() => {});
  await client.talk(
    [
      "/system/scheduler/add",
      `=name=${profile.name}`,
      `=interval=${profile.monitorInterval}`,
      `=on-event=${profile.monitorOnEvent}`,
      "=policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon",
      "=start-date=jan/01/2024",
      "=start-time=00:00:00",
      `=comment=Monitor Profile ${profile.name}`,
    ],
    timeoutMs,
  );
}
