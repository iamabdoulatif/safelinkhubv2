// Aligner le PRIX inscrit dans le profil hotspot du routeur sur celui du
// forfait. Module « plain » : rien ici ne doit devenir un endpoint.
//
// POURQUOI CE MODULE EXISTE : le prix vit à DEUX endroits. Le portail lit celui
// de la base en direct — donc changer un forfait suffit à ce que le client
// paie le bon montant. Mais le profil hotspot embarque le prix DANS son script
// `on-login`, et c'est ce script qui écrit le journal de ventes MikHmon. Or
// ensureVoucherProfileOnRouter s'arrête net si le profil existe déjà : un
// forfait passé de 2 000 à 2 500 F faisait donc payer 2 500 au client et
// enregistrer 2 000 dans la comptabilité.

import type { RouterOSClient } from "@/lib/mikrotik/client";
import {
  buildCustomDurationCode,
  buildVoucherProfile,
  type DurationUnit,
} from "@/lib/mikrotik/voucher-profiles";
import { appendRoamingSeenHook, ROAM_HOOK_MARKER } from "@/lib/roaming/on-login-hook";
import { deriveRouterKey } from "@/lib/roaming/webhook-secret";
import { getAppUrl } from "@/lib/net/app-url";

/** Unité d'un forfait (« Months ») → unité de profil (« mo »). */
export const PROFILE_UNIT_FROM_PACKAGE: Record<string, DurationUnit> = {
  Minutes: "m",
  Hours: "h",
  Days: "d",
  Weeks: "w",
  Months: "mo",
};

export type PriceSyncResult =
  | { updated: false; reason: string }
  | { updated: true; profileName: string; keptRoamingHook: boolean };

/**
 * Réécrit le `on-login` du profil au nouveau tarif, EN PRÉSERVANT le crochet
 * de roaming s'il y était.
 *
 * C'est tout l'enjeu : la station roaming ajoute par-dessus le `on-login` un
 * fragment qui signale au SaaS le couple (code, MAC) vu, et c'est lui qui rend
 * l'auto-login inter-zones possible. Réécrire le script sans le remettre
 * casserait le roaming — raison pour laquelle il ne faut jamais se contenter
 * d'un `set` aveugle.
 */
export async function syncProfilePriceOnRouter(
  client: RouterOSClient,
  opts: {
    profileName: string;
    durationValue: number;
    durationUnit: string;
    priceCents: number;
    uploadMbps?: number | null;
    downloadMbps?: number | null;
    routerId: string;
    timeoutMs?: number;
  },
): Promise<PriceSyncResult> {
  const t = opts.timeoutMs ?? 20000;
  const unit = PROFILE_UNIT_FROM_PACKAGE[opts.durationUnit];
  if (!unit) return { updated: false, reason: `unité de durée inconnue : ${opts.durationUnit}` };

  const rows = await client
    .talk(["/ip/hotspot/user/profile/print", `?name=${opts.profileName}`], t)
    .catch(() => [] as Record<string, string>[]);
  const existing = rows[0];
  if (!existing?.[".id"]) {
    // Pas encore posé : la création normale l'écrira au bon prix.
    return { updated: false, reason: "profil absent du routeur" };
  }

  const rebuilt = buildVoucherProfile({
    name: opts.profileName,
    label: opts.profileName,
    durationCode: buildCustomDurationCode(opts.durationValue, unit),
    price: opts.priceCents,
    uploadMbps: opts.uploadMbps ?? undefined,
    downloadMbps: opts.downloadMbps ?? undefined,
  });

  const keptRoamingHook = String(existing["on-login"] ?? "").includes(ROAM_HOOK_MARKER);
  const onLogin = keptRoamingHook
    ? appendRoamingSeenHook(
        rebuilt.onLogin,
        getAppUrl(),
        opts.routerId,
        deriveRouterKey(opts.routerId),
      )
    : rebuilt.onLogin;

  const command = [
    "/ip/hotspot/user/profile/set",
    `=.id=${existing[".id"]}`,
    `=on-login=${onLogin}`,
  ];
  if (rebuilt.rateLimit) command.push(`=rate-limit=${rebuilt.rateLimit}`);
  await client.talk(command, t);

  return { updated: true, profileName: opts.profileName, keptRoamingHook };
}
