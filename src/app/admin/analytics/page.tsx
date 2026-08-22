import { and, desc, eq, gte, lte } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { autoSetupAuthorizations, organizations, remoteAccessAuthorizations, users } from "@/lib/db/schema";
import {
  filterPlatformSalesRows,
  previousRange,
  summarizePlatformSales,
  type PlatformSaleRow,
} from "@/lib/admin/platform-analytics";
import DateRangePicker from "../DateRangePicker";
import PlatformAnalyticsView from "./PlatformAnalyticsView";

function toParam(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function parseDay(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}

function parseRange(params: { from?: string; to?: string }) {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  let from = parseDay(params.from) ?? defaultFrom;
  let to = parseDay(params.to) ?? now;
  if (from > to) [from, to] = [to, from];
  const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
  return { from, to, toEnd };
}

function activePreset(from: Date, to: Date, now: Date) {
  const fromParam = toParam(from);
  const toParamValue = toParam(to);
  const daysAgo = (days: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() - days);
    return toParam(date);
  };
  if (toParamValue !== toParam(now)) return null;
  if (fromParam === toParam(new Date(now.getFullYear(), now.getMonth(), 1))) return "month";
  if (fromParam === daysAgo(6)) return "7d";
  if (fromParam === daysAgo(29)) return "30d";
  return null;
}

export default async function PlatformAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) redirect("/admin");

  const params = await searchParams;
  const { from, to, toEnd } = parseRange(params);
  const precedent = previousRange(from, toEnd);
  const db = getDb();

  /* Une seule lecture pour DEUX fenêtres : on descend jusqu'au début de la
     période précédente et on tranche en mémoire. Deux requêtes de plus sur les
     mêmes tables coûteraient deux allers-retours pour la même information. */

  const [autoSetupRows, vpnRows] = await Promise.all([
    db
      .select({
        id: autoSetupAuthorizations.id,
        orgId: autoSetupAuthorizations.orgId,
        orgName: organizations.name,
        requesterName: autoSetupAuthorizations.requesterName,
        requesterEmail: autoSetupAuthorizations.requesterEmail,
        requesterRole: users.role,
        amountFcfa: autoSetupAuthorizations.amountFcfa,
        paymentMethod: autoSetupAuthorizations.paymentMethod,
        status: autoSetupAuthorizations.status,
        consumedAt: autoSetupAuthorizations.consumedAt,
        createdAt: autoSetupAuthorizations.createdAt,
      })
      .from(autoSetupAuthorizations)
      .innerJoin(organizations, eq(autoSetupAuthorizations.orgId, organizations.id))
      .leftJoin(users, eq(autoSetupAuthorizations.userId, users.id))
      .where(and(gte(autoSetupAuthorizations.createdAt, precedent.from), lte(autoSetupAuthorizations.createdAt, toEnd)))
      .orderBy(desc(autoSetupAuthorizations.createdAt)),
    db
      .select({
        id: remoteAccessAuthorizations.id,
        orgId: remoteAccessAuthorizations.orgId,
        orgName: organizations.name,
        requesterName: remoteAccessAuthorizations.requesterName,
        requesterEmail: remoteAccessAuthorizations.requesterEmail,
        amountFcfa: remoteAccessAuthorizations.amountFcfa,
        paymentMethod: remoteAccessAuthorizations.paymentMethod,
        service: remoteAccessAuthorizations.service,
        billingPeriod: remoteAccessAuthorizations.billingPeriod,
        status: remoteAccessAuthorizations.status,
        consumedAt: remoteAccessAuthorizations.consumedAt,
        createdAt: remoteAccessAuthorizations.createdAt,
      })
      .from(remoteAccessAuthorizations)
      .innerJoin(organizations, eq(remoteAccessAuthorizations.orgId, organizations.id))
      .where(and(gte(remoteAccessAuthorizations.createdAt, precedent.from), lte(remoteAccessAuthorizations.createdAt, toEnd)))
      .orderBy(desc(remoteAccessAuthorizations.createdAt)),
  ]);

  const rows: PlatformSaleRow[] = [
    ...vpnRows.map((row) => ({
      id: row.id,
      kind: "vpn" as const,
      orgId: row.orgId,
      orgName: row.orgName,
      requesterName: row.requesterName,
      requesterEmail: row.requesterEmail,
      amountFcfa: row.amountFcfa,
      paymentMethod: row.paymentMethod,
      service: row.service,
      billingPeriod: row.billingPeriod,
      status: row.status,
      consumedAt: iso(row.consumedAt),
      createdAt: row.createdAt.toISOString(),
    })),
    ...autoSetupRows.map((row) => ({
      id: row.id,
      kind: "auto_setup" as const,
      orgId: row.orgId,
      orgName: row.orgName,
      requesterName: row.requesterName,
      requesterEmail: row.requesterEmail,
      requesterRole: row.requesterRole,
      amountFcfa: row.amountFcfa,
      paymentMethod: row.paymentMethod,
      service: null,
      billingPeriod: null,
      status: row.status,
      consumedAt: iso(row.consumedAt),
      createdAt: row.createdAt.toISOString(),
    })),
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const dansPeriode = (row: PlatformSaleRow, debut: Date, fin: Date) => {
    const quand = new Date(row.createdAt).getTime();
    return quand >= debut.getTime() && quand <= fin.getTime();
  };
  const reportableRows = filterPlatformSalesRows(rows).filter((row) =>
    dansPeriode(row, from, toEnd),
  );

  const report = summarizePlatformSales(reportableRows, { from, to: toEnd });
  const rapportPrecedent = summarizePlatformSales(
    filterPlatformSalesRows(rows).filter((row) => dansPeriode(row, precedent.from, precedent.toEnd)),
    { from: precedent.from, to: precedent.toEnd },
  );
  const now = new Date();
  const fromParam = toParam(from);
  const toParamValue = toParam(to);
  const rangeLabel = `${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(from)} – ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(to)}`;

  return (
    <>
      <div className="mb-5 flex justify-end">
        <DateRangePicker from={fromParam} to={toParamValue} activePreset={activePreset(from, to, now)} />
      </div>
      <PlatformAnalyticsView
        report={report}
        previousKpis={rapportPrecedent.kpis}
        rows={reportableRows}
        rangeLabel={rangeLabel}
      />
    </>
  );
}
