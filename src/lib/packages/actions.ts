"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { packages, routers } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/auth/session";

/** Forfaits actifs de l'organisation — utilisé par l'auto-setup routeur
 * pour pré-remplir les profils voucher sans les ressaisir à la main.
 *
 * Scopé au routeur (mêmes règles strictes que le portail captif) : si un
 * routerId est fourni et que ce routeur a ≥1 forfait rattaché, on ne renvoie
 * que ceux-là ; sinon on retombe sur les forfaits legacy globaux (routerId
 * null). Sans routerId (appelant historique) : tous les forfaits de l'org. */
export async function listActivePackages(routerId?: string) {
  const session = await requireAdminSession();
  if (!session) return [];
  const db = getDb();
  const columns = {
    id: packages.id,
    name: packages.name,
    priceCents: packages.priceCents,
    durationValue: packages.durationValue,
    durationUnit: packages.durationUnit,
  } as const;
  if (!routerId) {
    return db
      .select(columns)
      .from(packages)
      .where(and(eq(packages.orgId, session.orgId), eq(packages.active, true)));
  }
  const scoped = await db
    .select(columns)
    .from(packages)
    .where(
      and(
        eq(packages.orgId, session.orgId),
        eq(packages.active, true),
        eq(packages.routerId, routerId),
      ),
    );
  if (scoped.length > 0) return scoped;
  return db
    .select(columns)
    .from(packages)
    .where(
      and(
        eq(packages.orgId, session.orgId),
        eq(packages.active, true),
        isNull(packages.routerId),
      ),
    );
}

/** Routeurs de l'org (id + nom) — alimente le sélecteur de zone du modal de
 * création de forfait pour rattacher un forfait à un MikroTik précis. */
export async function listOrgRouters() {
  const session = await requireAdminSession();
  if (!session) return [];
  const db = getDb();
  return db
    .select({ id: routers.id, name: routers.name })
    .from(routers)
    .where(eq(routers.orgId, session.orgId))
    .orderBy(asc(routers.name));
}

export async function createPackage(_prevState: unknown, formData: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Not authenticated." };

  const name = String(formData.get("name") ?? "").trim();
  // Zone WiFi : forfait rattaché à un MikroTik précis, ou "" = global (routerId
  // null, visible sur tous les routeurs sans forfait propre).
  const routerIdRaw = String(formData.get("routerId") ?? "").trim();
  const durationValue = Number(formData.get("durationValue") ?? 0);
  const durationUnit = String(formData.get("durationUnit") ?? "Hours");
  const uploadMbps = Number(formData.get("uploadMbps") ?? 5);
  const downloadMbps = Number(formData.get("downloadMbps") ?? 5);
  const price = Number(formData.get("price") ?? 0);
  const billingStartsOn = String(
    formData.get("billingStartsOn") ?? "Upon First Use",
  );

  if (!name || !Number.isFinite(durationValue) || durationValue <= 0) {
    return { error: "Package name and duration are required." };
  }
  if (
    !Number.isFinite(uploadMbps) ||
    uploadMbps <= 0 ||
    !Number.isFinite(downloadMbps) ||
    downloadMbps <= 0
  ) {
    return { error: "Bandwidth values must be positive numbers." };
  }
  if (!Number.isFinite(price) || price < 500) {
    return { error: "Minimum price: FCFA 500" };
  }

  const db = getDb();

  // Rattachement à un routeur : n'accepte qu'un MikroTik de l'org (sinon global).
  let routerId: string | null = null;
  if (routerIdRaw) {
    const [router] = await db
      .select({ id: routers.id })
      .from(routers)
      .where(and(eq(routers.id, routerIdRaw), eq(routers.orgId, session.orgId)))
      .limit(1);
    if (!router) return { error: "Routeur invalide." };
    routerId = router.id;
  }

  await db.insert(packages).values({
    orgId: session.orgId,
    routerId,
    name,
    priceCents: price,
    durationValue,
    durationUnit,
    uploadMbps,
    downloadMbps,
    billingStartsOn,
  });

  revalidatePath("/admin/packages");
  return { success: true };
}

/**
 * Change le tarif d'un forfait — l'action qui manquait.
 *
 * L'application ne savait que CRÉER et DÉSACTIVER : modifier un prix imposait
 * de passer par la base. D'où des tarifs corrigés à la main, sans que le
 * routeur en sache rien.
 *
 * Le portail lit les prix en direct, donc la base suffit pour ce que paie le
 * client. Mais le profil hotspot du routeur embarque le prix dans son script,
 * et c'est lui qui écrit le journal de ventes MikHmon : on le resynchronise
 * dans le même geste, sinon la comptabilité et l'encaissement divergent.
 */
export async function updatePackagePrice(_prevState: unknown, formData: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };

  const packageId = String(formData.get("packageId") ?? "");
  const raw = String(formData.get("priceCents") ?? "").replace(/\s/g, "");
  const priceCents = Number(raw);
  if (!packageId) return { error: "Forfait introuvable." };
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(priceCents)) {
    return { error: "Indiquez un tarif entier en FCFA (0 ou plus)." };
  }

  const db = getDb();
  const [pkg] = await db
    .select()
    .from(packages)
    .where(and(eq(packages.id, packageId), eq(packages.orgId, session.orgId)))
    .limit(1);
  if (!pkg) return { error: "Forfait introuvable." };
  if (pkg.priceCents === priceCents) {
    return { success: true, summary: `Tarif déjà à ${priceCents.toLocaleString("fr-FR")} F.` };
  }

  await db.update(packages).set({ priceCents }).where(eq(packages.id, packageId));
  revalidatePath("/admin/packages");
  revalidatePath("/admin/settings/router-setup");

  // Resynchronisation du routeur : best-effort et NOMMÉE. Un routeur
  // injoignable ne doit pas annuler le changement de tarif — mais l'opérateur
  // doit savoir que son journal MikHmon reste sur l'ancien prix.
  if (!pkg.routerId) {
    return {
      success: true,
      summary:
        `Tarif porté à ${priceCents.toLocaleString("fr-FR")} F. Forfait non rattaché à un ` +
        "routeur : aucun profil à resynchroniser.",
    };
  }

  const [router] = await db
    .select()
    .from(routers)
    .where(and(eq(routers.id, pkg.routerId), eq(routers.orgId, session.orgId)))
    .limit(1);
  if (!router) {
    return { success: true, summary: `Tarif porté à ${priceCents.toLocaleString("fr-FR")} F.` };
  }

  const { connectToRouter } = await import("@/lib/mikrotik/router-sync");
  const { syncProfilePriceOnRouter } = await import("./price-sync");
  try {
    const client = await connectToRouter(router, 20000);
    try {
      const sync = await syncProfilePriceOnRouter(client, {
        profileName: pkg.name,
        durationValue: pkg.durationValue,
        durationUnit: pkg.durationUnit,
        priceCents,
        uploadMbps: pkg.uploadMbps,
        downloadMbps: pkg.downloadMbps,
        routerId: router.id,
      });
      const profilePart = sync.updated
        ? `profil « ${pkg.name} » resynchronisé` + (sync.keptRoamingHook ? " (roaming préservé)" : "")
        : `profil non resynchronisé (${sync.reason})`;

      // La page du portail INSTALLÉE sur le routeur est un instantané. Celles
      // posées avant l'arrivée des prix en direct affichent donc encore
      // l'ancien tarif, même après correction en base — c'est ce qu'un client
      // de HSPT-NAMOIN voyait : 2 000 F sur son téléphone, 2 500 F dans le
      // SaaS. On la ré-envoie, elle repartira avec le script qui lit les prix
      // en direct.
      const portalPart = router.captiveTemplateId
        ? await (async () => {
            const { installTemplateOnRouter } = await import("@/lib/captive-templates/actions");
            const res = await installTemplateOnRouter(router.id, router.captiveTemplateId!);
            return "error" in res ? `portail NON réinstallé (${res.error})` : "portail réinstallé";
          })()
        : "aucun portail rattaché à ce routeur";

      return {
        success: true,
        summary: `Tarif porté à ${priceCents.toLocaleString("fr-FR")} F — ${profilePart}, ${portalPart}.`,
      };
    } finally {
      client.close();
    }
  } catch (err) {
    return {
      success: true,
      summary:
        `Tarif porté à ${priceCents.toLocaleString("fr-FR")} F, mais ${router.name} est ` +
        `injoignable : son journal MikHmon gardera l'ancien prix jusqu'à une resynchronisation ` +
        `(${err instanceof Error ? err.message : "erreur inconnue"}).`,
    };
  }
}

export async function togglePackageStatus(packageId: string) {
  const session = await requireAdminSession();
  if (!session) return;

  const db = getDb();
  const [pkg] = await db
    .select({ active: packages.active, orgId: packages.orgId })
    .from(packages)
    .where(eq(packages.id, packageId))
    .limit(1);

  if (!pkg || pkg.orgId !== session.orgId) return;

  await db
    .update(packages)
    .set({ active: !pkg.active })
    .where(eq(packages.id, packageId));

  revalidatePath("/admin/packages");
}
