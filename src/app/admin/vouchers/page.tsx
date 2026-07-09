import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { vouchers, packages, routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import GenerateVouchersModal from "./GenerateVouchersModal";
import VoucherTable, { type VoucherRow } from "./VoucherTable";

function formatDate(date: Date | null) {
  if (!date) return "Jamais";
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function VouchersPage() {
  const session = await getSession();
  const db = getDb();

  const orgPackages = session
    ? await db
        .select({ id: packages.id, name: packages.name })
        .from(packages)
        .where(eq(packages.orgId, session.orgId))
    : [];

  const packageNameById = new Map(orgPackages.map((p) => [p.id, p.name]));

  // Routeurs de l'org sur lesquels provisionner les vouchers (le hotspot vit
  // sur un MikroTik précis). L'ordre met les routeurs en ligne en premier.
  const orgRouters = session
    ? await db
        .select({ id: routers.id, name: routers.name, status: routers.status })
        .from(routers)
        .where(eq(routers.orgId, session.orgId))
        .orderBy(desc(routers.status))
    : [];

  const orgVouchers = session
    ? await db
        .select()
        .from(vouchers)
        .where(eq(vouchers.orgId, session.orgId))
        .orderBy(desc(vouchers.createdAt))
    : [];

  const rows: VoucherRow[] = orgVouchers.map((v) => ({
    id: v.id,
    username: v.username,
    packageName: packageNameById.get(v.packageId ?? "") ?? "—",
    status: v.status,
    firstLogin: formatDate(v.firstLoginAt),
    expiresOn: formatDate(v.expiresAt),
    useCase: v.useCase,
    note: v.note ?? "—",
    createdOn: formatDate(v.createdAt),
  }));

  return (
    <VoucherTable
      vouchers={rows}
      headerExtra={<GenerateVouchersModal packages={orgPackages} routers={orgRouters} />}
    />
  );
}
