"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import {
  roamingGroups,
  roamingProfiles,
  roamingGroupOffers,
  vouchers,
} from "@/lib/db/schema";
import {
  packageProfileName,
  isUnlimitedUnit,
} from "@/lib/mikrotik/package-voucher-profile";
import { parseRoamingPriceOverride } from "./forms";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function refresh() {
  revalidatePath("/admin/roaming");
  revalidatePath("/admin/vouchers");
}
function failed(error: unknown) {
  return {
    error:
      (error as { code?: string })?.code === "23505"
        ? "Ce nom de profil existe déjà."
        : "Enregistrement impossible. Actualisez la page et réessayez.",
  };
}

/** The technical group code stays stable: it is used by the router hooks. */
export async function updateRoamingGroup(_previous: unknown, form: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };
  const id = String(form.get("id") ?? ""),
    name = String(form.get("name") ?? "").trim();
  if (!uuid.test(id) || !name || name.length > 80)
    return { error: "Saisissez un nom de groupe de 1 à 80 caractères." };
  const db = getDb(),
    scope = and(
      eq(roamingGroups.id, id),
      eq(roamingGroups.orgId, session.orgId),
    );
  try {
    const result = await db.transaction(async (tx) => {
      const [group] = await tx
        .select()
        .from(roamingGroups)
        .where(scope)
        .for("update")
        .limit(1);
      if (!group) return { error: "Groupe introuvable." };
      await tx.update(roamingGroups).set({ name }).where(scope);
      return { success: true };
    });
    refresh();
    return result;
  } catch (error) {
    return failed(error);
  }
}

export async function updateRoamingProfile(_previous: unknown, form: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };
  const id = String(form.get("id") ?? ""),
    unit = String(form.get("durationUnit") ?? "");
  const durationValue = isUnlimitedUnit(unit)
    ? 0
    : Number(form.get("durationValue"));
  const uploadMbps = Number(form.get("uploadMbps")),
    downloadMbps = Number(form.get("downloadMbps"));
  const price = String(form.get("defaultPriceCents") ?? "").trim(),
    defaultPriceCents = Number(price);
  if (
    !uuid.test(id) ||
    ![durationValue, uploadMbps, downloadMbps, defaultPriceCents].every(
      Number.isSafeInteger,
    ) ||
    uploadMbps < 1 ||
    downloadMbps < 1 ||
    uploadMbps > 100000 ||
    downloadMbps > 100000 ||
    !price ||
    defaultPriceCents < 0 ||
    defaultPriceCents > 2147483647 ||
    (!isUnlimitedUnit(unit) && durationValue < 1)
  )
    return { error: "Vérifiez la durée, les débits et le tarif." };
  const name = packageProfileName(durationValue, unit);
  if (!name)
    return {
      error:
        "Cette durée n’est pas prise en charge. Choisissez une durée standard.",
    };
  const db = getDb(),
    scope = and(
      eq(roamingProfiles.id, id),
      eq(roamingProfiles.orgId, session.orgId),
    );
  try {
    const result = await db.transaction(async (tx) => {
      // Blocks concurrent FK references until dependency checks and edit commit.
      const [profile] = await tx
        .select()
        .from(roamingProfiles)
        .where(scope)
        .for("update")
        .limit(1);
      if (!profile) return { error: "Profil introuvable." };
      const structural =
        profile.name !== name ||
        profile.durationValue !== durationValue ||
        profile.durationUnit !== unit ||
        profile.uploadMbps !== uploadMbps ||
        profile.downloadMbps !== downloadMbps;
      if (structural) {
        const [offer] = await tx
          .select({ id: roamingGroupOffers.id })
          .from(roamingGroupOffers)
          .where(
            and(
              eq(roamingGroupOffers.profileId, id),
              eq(roamingGroupOffers.orgId, session.orgId),
            ),
          )
          .limit(1);
        if (offer)
          return {
            error:
              "Ce profil est lié à une offre. Retirez ses offres avant de changer sa durée ou ses débits, ou créez un nouveau profil. Le tarif reste modifiable.",
          };
        const [access] = await tx
          .select({ id: vouchers.id })
          .from(vouchers)
          .where(
            and(
              eq(vouchers.roamingProfileId, id),
              eq(vouchers.orgId, session.orgId),
            ),
          )
          .limit(1);
        if (access)
          return {
            error:
              "Des accès ont été émis avec ce profil. Créez un nouveau profil pour modifier la durée ou les débits. Le tarif reste modifiable.",
          };
      }
      await tx
        .update(roamingProfiles)
        .set({
          name,
          durationValue,
          durationUnit: unit,
          uploadMbps,
          downloadMbps,
          defaultPriceCents,
        })
        .where(scope);
      return { success: true };
    });
    refresh();
    return result;
  } catch (error) {
    return failed(error);
  }
}

export async function deleteRoamingProfile(_previous: unknown, form: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };
  const id = String(form.get("id") ?? "");
  if (!uuid.test(id)) return { error: "Profil invalide." };
  const db = getDb(),
    scope = and(
      eq(roamingProfiles.id, id),
      eq(roamingProfiles.orgId, session.orgId),
    );
  try {
    const result = await db.transaction(async (tx) => {
      const [profile] = await tx
        .select()
        .from(roamingProfiles)
        .where(scope)
        .for("update")
        .limit(1);
      if (!profile) return { error: "Profil introuvable." };
      const [offer] = await tx
        .select({ id: roamingGroupOffers.id })
        .from(roamingGroupOffers)
        .where(
          and(
            eq(roamingGroupOffers.profileId, id),
            eq(roamingGroupOffers.orgId, session.orgId),
          ),
        )
        .limit(1);
      if (offer)
        return {
          error:
            "Retirez les offres utilisant ce profil avant de le supprimer.",
        };
      const [access] = await tx
        .select({ id: vouchers.id })
        .from(vouchers)
        .where(
          and(
            eq(vouchers.roamingProfileId, id),
            eq(vouchers.orgId, session.orgId),
          ),
        )
        .limit(1);
      if (access)
        return {
          error:
            "Ce profil est utilisé par des accès ou leur historique. Il ne peut pas être supprimé.",
        };
      await tx.delete(roamingProfiles).where(scope);
      return { success: true };
    });
    refresh();
    return result;
  } catch (error) {
    return failed(error);
  }
}

export async function updateRoamingOffer(_previous: unknown, form: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };
  const id = String(form.get("id") ?? ""),
    priceOverrideCents = parseRoamingPriceOverride(
      String(form.get("priceOverrideCents") ?? ""),
    );
  if (
    !uuid.test(id) ||
    priceOverrideCents === undefined ||
    (priceOverrideCents !== null && priceOverrideCents > 2147483647)
  )
    return {
      error:
        "Saisissez un tarif valide ou laissez vide pour le prix catalogue.",
    };
  const db = getDb(),
    scope = and(
      eq(roamingGroupOffers.id, id),
      eq(roamingGroupOffers.orgId, session.orgId),
    );
  try {
    const result = await db.transaction(async (tx) => {
      const [offer] = await tx
        .select()
        .from(roamingGroupOffers)
        .where(scope)
        .for("update")
        .limit(1);
      if (!offer) return { error: "Offre introuvable." };
      await tx
        .update(roamingGroupOffers)
        .set({ priceOverrideCents })
        .where(scope);
      return { success: true };
    });
    refresh();
    return result;
  } catch (error) {
    return failed(error);
  }
}
