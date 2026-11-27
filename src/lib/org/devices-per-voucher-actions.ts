"use server";

// Réglage « Appareils par code » (organizations.devicesPerVoucher) : le fixer,
// et le POUSSER sur le parc (shared-users des profils vendables de chaque
// routeur en ligne). Cf. [[mikhmon-shared-users-profile-lever]].
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { organizations, routers } from "@/lib/db/schema";
import { connectToRouter } from "@/lib/mikrotik/router-sync";
import {
  clampDevicesPerVoucher,
  profileTakesDevicesPerVoucher,
} from "@/lib/mikrotik/voucher-profiles";

export type SetDevicesResult = { error: string } | { success: true; value: number };

/** Enregistre le nombre d'appareils par code pour l'org (clampé [1,100]). */
export async function setDevicesPerVoucher(value: number): Promise<SetDevicesResult> {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };
  const n = clampDevicesPerVoucher(value);
  const db = getDb();
  await db
    .update(organizations)
    .set({ devicesPerVoucher: n })
    .where(eq(organizations.id, session.orgId));
  revalidatePath("/admin/packages");
  return { success: true, value: n };
}

export type ApplyFleetResult =
  | { error: string }
  | {
      success: true;
      value: number;
      routersUpdated: number;
      profilesUpdated: number;
      offline: number;
      failed: { router: string; error: string }[];
    };

/**
 * Pousse la valeur courante sur TOUS les routeurs en ligne de l'org : set
 * shared-users sur chaque profil vendable (hors système / voie de paiement /
 * illimité). En parallèle, borné par routeur, best-effort — un routeur
 * injoignable est rapporté sans bloquer les autres.
 * ponytail: synchrone ; passer en job (routerRestoreJobs) si un jour un parc
 * dépasse la fenêtre Cloudflare ~100 s (ici ≤ quelques dizaines de routeurs).
 */
export async function applyDevicesPerVoucherToFleet(): Promise<ApplyFleetResult> {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };
  const db = getDb();

  const [org] = await db
    .select({ n: organizations.devicesPerVoucher })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);
  const n = clampDevicesPerVoucher(org?.n);

  const rows = await db
    .select()
    .from(routers)
    .where(eq(routers.orgId, session.orgId));
  const online = rows.filter((r) => r.status === "online");
  const offline = rows.length - online.length;

  const settled = await Promise.allSettled(
    online.map(async (router) => {
      const client = await connectToRouter(router, 12000);
      try {
        const profiles = await client.talk(
          ["/ip/hotspot/user/profile/print", "=.proplist=.id,name"],
          12000,
        );
        let profilesUpdated = 0;
        for (const p of profiles) {
          const name = p.name;
          const id = p[".id"];
          if (!name || !id || !profileTakesDevicesPerVoucher(name)) continue;
          await client.talk(
            ["/ip/hotspot/user/profile/set", `=numbers=${id}`, `=shared-users=${n}`],
            12000,
          );
          profilesUpdated++;
        }
        return { router: router.name, profilesUpdated };
      } finally {
        client.close();
      }
    }),
  );

  let routersUpdated = 0;
  let profilesUpdated = 0;
  const failed: { router: string; error: string }[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      routersUpdated++;
      profilesUpdated += r.value.profilesUpdated;
    } else {
      failed.push({
        router: online[i]?.name ?? "?",
        error: r.reason instanceof Error ? r.reason.message : "Erreur routeur.",
      });
    }
  });

  return { success: true, value: n, routersUpdated, profilesUpdated, offline, failed };
}
