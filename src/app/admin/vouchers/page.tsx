import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  vouchers,
  packages,
  roamingGroups,
  roamingProfiles,
  routers,
  organizations,
  captiveTemplates,
} from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import {
  computeVoucherExpiry,
  durationFromProfileName,
  formatDurationHuman,
  type PackageDuration,
} from "@/lib/vouchers/expiry";
import type { TicketBrand } from "@/lib/vouchers/ticket-templates";
import GenerateVouchersModal from "./GenerateVouchersModal";
import ImportTicketsModal from "./ImportTicketsModal";
import ArchiveImportedButton from "./ArchiveImportedButton";
import VoucherTable, { type VoucherRow } from "./VoucherTable";
import { isImportedVoucherUseCase } from "@/lib/vouchers/source";

function formatDate(date: Date | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatPrice(cents: number | null | undefined) {
  if (cents == null) return null;
  return `FCFA ${cents.toLocaleString("en-US")}`;
}

export default async function VouchersPage() {
  const session = await getSession();
  const db = getDb();

  const orgPackages = session
    ? await db
        .select({
          id: packages.id,
          name: packages.name,
          priceCents: packages.priceCents,
          durationValue: packages.durationValue,
          durationUnit: packages.durationUnit,
          billingStartsOn: packages.billingStartsOn,
        })
        .from(packages)
        .where(eq(packages.orgId, session.orgId))
    : [];

  const packageById = new Map(orgPackages.map((p) => [p.id, p]));

  // Routeurs de l'org sur lesquels provisionner les vouchers (le hotspot vit
  // sur un MikroTik précis). L'ordre met les routeurs en ligne en premier.
  const orgRouters = session
    ? await db
        .select({ id: routers.id, name: routers.name, status: routers.status })
        .from(routers)
        .where(eq(routers.orgId, session.orgId))
        .orderBy(desc(routers.status))
    : [];

  const [orgVouchers, trashedVouchers, orgRoamingProfiles, orgRoamingGroups] = session
    ? await Promise.all([
        db
          .select()
          .from(vouchers)
          .where(and(eq(vouchers.orgId, session.orgId), isNull(vouchers.deletedAt)))
          .orderBy(desc(vouchers.createdAt)),
        db
          .select()
          .from(vouchers)
          .where(and(eq(vouchers.orgId, session.orgId), isNotNull(vouchers.deletedAt)))
          .orderBy(desc(vouchers.deletedAt)),
        db
          .select({
            id: roamingProfiles.id,
            name: roamingProfiles.name,
            durationValue: roamingProfiles.durationValue,
            durationUnit: roamingProfiles.durationUnit,
          })
          .from(roamingProfiles)
          .where(eq(roamingProfiles.orgId, session.orgId)),
        db
          .select({ id: roamingGroups.id, name: roamingGroups.name })
          .from(roamingGroups)
          .where(eq(roamingGroups.orgId, session.orgId)),
      ])
    : [[], [], [], []];

  const roamingProfileById = new Map(orgRoamingProfiles.map((profile) => [profile.id, profile]));
  const roamingGroupById = new Map(orgRoamingGroups.map((group) => [group.id, group]));

  // Branding pour les tickets : nom de l'org + modèle de portail par défaut.
  const [org] = session
    ? await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, session.orgId))
        .limit(1)
    : [];

  const [defaultTemplate] = session
    ? await db
        .select({
          logoUrl: captiveTemplates.logoUrl,
          primaryColor: captiveTemplates.primaryColor,
          supportPhone: captiveTemplates.packageSupportPhone,
          supportWhatsapp: captiveTemplates.packageSupportWhatsapp,
        })
        .from(captiveTemplates)
        .where(eq(captiveTemplates.orgId, session.orgId))
        .orderBy(desc(captiveTemplates.isDefault))
        .limit(1)
    : [];

  const brand: TicketBrand = {
    hotspotName: org?.name ?? "Hotspot Wi-Fi",
    logoUrl: defaultTemplate?.logoUrl ?? null,
    primaryColor: defaultTemplate?.primaryColor ?? null,
    supportPhone: defaultTemplate?.supportPhone ?? null,
    supportWhatsapp: defaultTemplate?.supportWhatsapp ?? null,
  };

  function toVoucherRow(v: (typeof orgVouchers)[number]): VoucherRow {
    const pkg = v.packageId ? packageById.get(v.packageId) : undefined;
    const roamingProfile = v.roamingProfileId ? roamingProfileById.get(v.roamingProfileId) : undefined;
    const roamingGroup = v.roamingGroupId ? roamingGroupById.get(v.roamingGroupId) : undefined;
    // Repli sur le profil hotspot figé (v.profileName) quand le forfait a été
    // élagué : le voucher garde sa durée réelle, plus de « — » trompeur.
    const pkgDuration: PackageDuration | null = pkg
      ? {
          durationValue: pkg.durationValue,
          durationUnit: pkg.durationUnit,
          billingStartsOn: pkg.billingStartsOn,
        }
      : roamingProfile
        ? {
            durationValue: roamingProfile.durationValue,
            durationUnit: roamingProfile.durationUnit,
            billingStartsOn: "Upon First Use",
          }
        : durationFromProfileName(v.profileName);

    const expiry = computeVoucherExpiry(
      {
        expiresAt: v.expiresAt,
        firstLoginAt: v.firstLoginAt,
        createdAt: v.createdAt,
      },
      pkgDuration,
    );

    let expiresOn: string;
    let expiresPending = false;
    if (expiry.kind === "date") {
      expiresOn = formatDate(expiry.date);
    } else if (expiry.kind === "pending") {
      expiresOn = `Valide ${expiry.validity} dès la 1ʳᵉ connexion`;
      expiresPending = true;
    } else {
      expiresOn = "—";
      expiresPending = true;
    }

    return {
      id: v.id,
      username: v.username,
      packageName: roamingGroup && roamingProfile
        ? `${roamingGroup.name} · ${roamingProfile.name}`
        : pkg?.name ?? roamingProfile?.name ?? v.profileName ?? "—",
      price: formatPrice(pkg?.priceCents ?? v.soldPriceCents),
      validity: pkgDuration ? formatDurationHuman(pkgDuration) : null,
      status: v.status,
      firstLogin: formatDate(v.firstLoginAt),
      expiresOn,
      expiresPending,
      expiresAtMs: expiry.kind === "date" ? expiry.date.getTime() : null,
      useCase: v.useCase,
      note: v.note ?? "—",
      deletedOn: formatDate(v.deletedAt),
      createdOn: formatDate(v.createdAt),
    };
  }

  const rows = orgVouchers.map(toVoucherRow);
  const trashRows = trashedVouchers.map(toVoucherRow);
  const stats = {
    active: rows.length,
    imported: rows.filter((voucher) => isImportedVoucherUseCase(voucher.useCase)).length,
    trashed: trashRows.length,
  };

  return (
    <VoucherTable
      activeVouchers={rows}
      trashedVouchers={trashRows}
      stats={stats}
      brand={brand}
      headerExtra={
        <div className="flex flex-wrap items-center gap-2">
          <ImportTicketsModal routers={orgRouters} packages={orgPackages} />
          <GenerateVouchersModal packages={orgPackages} routers={orgRouters} />
          <ArchiveImportedButton count={stats.imported} />
        </div>
      }
    />
  );
}
