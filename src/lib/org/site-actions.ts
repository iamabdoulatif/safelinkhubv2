"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers, sites } from "@/lib/db/schema";
import { requireCapability } from "@/lib/auth/session";
import { guardAssignRouter, guardCreateSite } from "./site-rules";

const PAGE = "/admin/sites";

/** La capacité "routers" suffit : organiser le parc en agences en fait partie.
 *  Un RBAC par site (qui peut toucher QUEL site) viendra au chantier #1b. */
const CAP = "routers" as const;

/** 23505 = violation d'unicité Postgres (ici l'index (org_id, code)). */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}

export async function createSite(_prevState: unknown, formData: FormData) {
  const session = await requireCapability(CAP);
  if (!session) return { error: "Action réservée aux gestionnaires du parc." };

  const verdict = guardCreateSite({
    name: String(formData.get("name") ?? ""),
    code: String(formData.get("code") ?? ""),
  });
  if (!verdict.ok) return { error: verdict.error };

  try {
    await getDb().insert(sites).values({
      orgId: session.orgId,
      name: verdict.name!,
      code: verdict.code!,
      locationCommune: String(formData.get("locationCommune") ?? "").trim() || null,
      locationCountry: String(formData.get("locationCountry") ?? "").trim() || null,
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { error: `Un site porte déjà le code « ${verdict.code} ».` };
    }
    throw e;
  }
  revalidatePath(PAGE);
  return { success: true as const };
}

export async function renameSite(formData: FormData) {
  const session = await requireCapability(CAP);
  if (!session) return { error: "Action réservée aux gestionnaires du parc." };

  const siteId = String(formData.get("siteId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Le nom du site est requis." };

  // orgId de la SESSION dans le WHERE : un id du formulaire ne doit pas pouvoir
  // renommer le site d'une autre organisation.
  await getDb()
    .update(sites)
    .set({ name })
    .where(and(eq(sites.id, siteId), eq(sites.orgId, session.orgId)));
  revalidatePath(PAGE);
  return { success: true as const };
}

export async function setSiteActive(formData: FormData) {
  const session = await requireCapability(CAP);
  if (!session) return { error: "Action réservée aux gestionnaires du parc." };

  const siteId = String(formData.get("siteId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  await getDb()
    .update(sites)
    .set({ active })
    .where(and(eq(sites.id, siteId), eq(sites.orgId, session.orgId)));
  revalidatePath(PAGE);
  return { success: true as const };
}

/** Supprime un site. Ses routeurs repassent site_id = null (ON DELETE SET NULL) :
 *  aucun orphelin, le parc reste intact. */
export async function deleteSite(formData: FormData) {
  const session = await requireCapability(CAP);
  if (!session) return { error: "Action réservée aux gestionnaires du parc." };

  const siteId = String(formData.get("siteId") ?? "");
  await getDb()
    .delete(sites)
    .where(and(eq(sites.id, siteId), eq(sites.orgId, session.orgId)));
  revalidatePath(PAGE);
  return { success: true as const };
}

/** Range un routeur dans un site (ou l'en sort si siteId est vide). Routeur ET
 *  site sont re-scopés sur l'org avant l'écriture. */
export async function assignRouterToSite(formData: FormData) {
  const session = await requireCapability(CAP);
  if (!session) return { error: "Action réservée aux gestionnaires du parc." };

  const routerId = String(formData.get("routerId") ?? "");
  const rawSiteId = String(formData.get("siteId") ?? "").trim();

  const [router] = await getDb()
    .select({ orgId: routers.orgId })
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router) return { error: "Routeur introuvable." };

  // Désaffectation : siteId vide → on détache, sans chercher de site.
  if (!rawSiteId) {
    const verdict = guardAssignRouter({
      routerOrgId: router.orgId,
      siteOrgId: session.orgId, // pas de site à vérifier côté org
      sessionOrgId: session.orgId,
    });
    if (!verdict.ok) return { error: verdict.error };
    await getDb()
      .update(routers)
      .set({ siteId: null })
      .where(and(eq(routers.id, routerId), eq(routers.orgId, session.orgId)));
    revalidatePath(PAGE);
    return { success: true as const };
  }

  const [site] = await getDb()
    .select({ orgId: sites.orgId })
    .from(sites)
    .where(eq(sites.id, rawSiteId))
    .limit(1);

  const verdict = guardAssignRouter({
    routerOrgId: router.orgId,
    siteOrgId: site?.orgId ?? null,
    sessionOrgId: session.orgId,
  });
  if (!verdict.ok) return { error: verdict.error };

  await getDb()
    .update(routers)
    .set({ siteId: rawSiteId })
    .where(and(eq(routers.id, routerId), eq(routers.orgId, session.orgId)));
  revalidatePath(PAGE);
  revalidatePath("/admin/router");
  return { success: true as const };
}
