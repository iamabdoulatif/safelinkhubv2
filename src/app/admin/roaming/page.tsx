import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  roamingGroupOffers,
  roamingGroupRouters,
  roamingGroups,
  roamingProfiles,
  routers,
  vouchers,
} from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { effectiveRoamingPrice } from "@/lib/roaming/pricing";
import { NAMED_USER_CASE } from "@/lib/roaming/provision";
import RoamingConsole from "./RoamingConsole";

export default async function RoamingPage() {
  const session = await getSession();
  const db = getDb();
  if (!session) {
    return <p className="text-sm text-ink-soft">Connectez-vous pour gérer vos groupes roaming.</p>;
  }

  const [groupRows, profileRows, offerRows, orgRouters, namedUsers] = await Promise.all([
    db
      .select({
        id: roamingGroups.id,
        name: roamingGroups.name,
        code: roamingGroups.code,
        active: roamingGroups.active,
        createdAt: roamingGroups.createdAt,
        routerId: routers.id,
        routerName: routers.name,
        routerStatus: routers.status,
      })
      .from(roamingGroups)
      .leftJoin(
        roamingGroupRouters,
        and(
          eq(roamingGroupRouters.groupId, roamingGroups.id),
          eq(roamingGroupRouters.orgId, session.orgId),
        ),
      )
      .leftJoin(
        routers,
        and(eq(roamingGroupRouters.routerId, routers.id), eq(routers.orgId, session.orgId)),
      )
      .where(eq(roamingGroups.orgId, session.orgId))
      .orderBy(asc(roamingGroups.name)),
    db
      .select({
        id: roamingProfiles.id,
        name: roamingProfiles.name,
        durationValue: roamingProfiles.durationValue,
        durationUnit: roamingProfiles.durationUnit,
        uploadMbps: roamingProfiles.uploadMbps,
        downloadMbps: roamingProfiles.downloadMbps,
        defaultPriceCents: roamingProfiles.defaultPriceCents,
        active: roamingProfiles.active,
      })
      .from(roamingProfiles)
      .where(eq(roamingProfiles.orgId, session.orgId))
      .orderBy(asc(roamingProfiles.durationValue)),
    db
      .select({
        id: roamingGroupOffers.id,
        groupId: roamingGroups.id,
        groupName: roamingGroups.name,
        groupCode: roamingGroups.code,
        groupActive: roamingGroups.active,
        profileId: roamingProfiles.id,
        profileName: roamingProfiles.name,
        defaultPriceCents: roamingProfiles.defaultPriceCents,
        priceOverrideCents: roamingGroupOffers.priceOverrideCents,
        active: roamingGroupOffers.active,
        profileActive: roamingProfiles.active,
      })
      .from(roamingGroupOffers)
      .innerJoin(roamingGroups, eq(roamingGroupOffers.groupId, roamingGroups.id))
      .innerJoin(roamingProfiles, eq(roamingGroupOffers.profileId, roamingProfiles.id))
      .where(
        and(
          eq(roamingGroupOffers.orgId, session.orgId),
          eq(roamingGroups.orgId, session.orgId),
          eq(roamingProfiles.orgId, session.orgId),
        ),
      )
      .orderBy(asc(roamingGroups.name), asc(roamingProfiles.durationValue)),
    db
      .select({ id: routers.id, name: routers.name, status: routers.status })
      .from(routers)
      .where(eq(routers.orgId, session.orgId))
      .orderBy(asc(routers.name)),
    // Comptes NOMINATIFS (admins, techniciens) : ils se distinguent des tickets
    // vendus par leur useCase, et méritent leur propre liste — on ne cherche pas
    // « aroune » au milieu de 3 000 codes.
    db
      .select({
        id: vouchers.id,
        username: vouchers.username,
        groupId: vouchers.roamingGroupId,
        profileName: vouchers.profileName,
        groupName: roamingGroups.name,
        note: vouchers.note,
        createdAt: vouchers.createdAt,
      })
      .from(vouchers)
      .leftJoin(roamingGroups, eq(vouchers.roamingGroupId, roamingGroups.id))
      .where(
        and(
          eq(vouchers.orgId, session.orgId),
          eq(vouchers.useCase, NAMED_USER_CASE),
          isNull(vouchers.deletedAt),
        ),
      )
      .orderBy(asc(vouchers.username)),
  ]);

  const groupById = new Map<
    string,
    {
      id: string;
      name: string;
      code: string;
      active: boolean;
      routers: { id: string; name: string; status: string }[];
    }
  >();
  for (const row of groupRows) {
    const group = groupById.get(row.id) ?? {
      id: row.id,
      name: row.name,
      code: row.code,
      active: row.active,
      routers: [],
    };
    if (row.routerId && row.routerName) {
      group.routers.push({ id: row.routerId, name: row.routerName, status: row.routerStatus ?? "offline" });
    }
    groupById.set(row.id, group);
  }

  return (
    <RoamingConsole
      groups={[...groupById.values()]}
      profiles={profileRows}
      offers={offerRows.map((offer) => ({
        ...offer,
        effectivePriceCents: effectiveRoamingPrice(offer.defaultPriceCents, offer.priceOverrideCents),
      }))}
      routers={orgRouters}
      namedUsers={namedUsers.map((user) => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
      }))}
    />
  );
}
