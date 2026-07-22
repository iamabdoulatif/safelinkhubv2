import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, safecoinAccounts, safecoinLedger, safecoinSettings } from "@/lib/db/schema";

export type SafecoinReportEntry = {
  orgId: string;
  amountScCents: number;
  entryType: string;
  status: string;
  createdAt: Date;
};

export type SafecoinDailyPoint = {
  day: string;
  issued: number;
  spent: number;
  fees: number;
};

const ISSUANCE_TYPES = new Set(["topup", "admin_credit", "refund"]);

export function aggregateSafecoinEntries(rows: SafecoinReportEntry[]) {
  const completed = rows.filter((row) => row.status === "completed");
  const issued = completed.reduce(
    (sum, row) => sum + (ISSUANCE_TYPES.has(row.entryType) && row.amountScCents > 0 ? row.amountScCents : 0),
    0,
  );
  const spent = completed.reduce(
    (sum, row) => sum + (["vpn_charge", "auto_setup_charge"].includes(row.entryType) ? Math.abs(row.amountScCents) : 0),
    0,
  );
  const fees = completed.reduce(
    (sum, row) => sum + (row.entryType === "fee" ? Math.abs(row.amountScCents) : 0),
    0,
  );
  const balances = new Map<string, number>();
  for (const row of completed) balances.set(row.orgId, (balances.get(row.orgId) ?? 0) + row.amountScCents);

  const dailyMap = new Map<string, SafecoinDailyPoint>();
  for (const row of rows) {
    const day = row.createdAt.toISOString().slice(0, 10);
    const point = dailyMap.get(day) ?? { day, issued: 0, spent: 0, fees: 0 };
    if (row.status === "completed" && ISSUANCE_TYPES.has(row.entryType) && row.amountScCents > 0) point.issued += row.amountScCents;
    if (row.status === "completed" && ["vpn_charge", "auto_setup_charge"].includes(row.entryType)) point.spent += Math.abs(row.amountScCents);
    if (row.status === "completed" && row.entryType === "fee") point.fees += Math.abs(row.amountScCents);
    dailyMap.set(day, point);
  }

  return {
    kpis: {
      issued,
      spent,
      fees,
      circulating: [...balances.values()].reduce((sum, balance) => sum + balance, 0),
      activeOrganizations: [...balances.values()].filter((balance) => balance > 0).length,
    },
    daily: [...dailyMap.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

export async function getSafecoinReport({ from, to }: { from: Date; to: Date }) {
  const db = getDb();
  const [settings, rows, accounts] = await Promise.all([
    db.select({ rateFcfaPerSc: safecoinSettings.rateFcfaPerSc, rechargeFeeScCents: safecoinSettings.rechargeFeeScCents, vpnFeeScCents: safecoinSettings.vpnFeeScCents, autoSetupFeeScCents: safecoinSettings.autoSetupFeeScCents, version: safecoinSettings.version, updatedAt: safecoinSettings.updatedAt }).from(safecoinSettings).limit(1),
    db
      .select({ orgId: safecoinLedger.orgId, amountScCents: safecoinLedger.amountScCents, entryType: safecoinLedger.entryType, status: safecoinLedger.status, createdAt: safecoinLedger.createdAt, id: safecoinLedger.id, note: safecoinLedger.note, referenceType: safecoinLedger.referenceType, referenceId: safecoinLedger.referenceId })
      .from(safecoinLedger)
      .where(and(gte(safecoinLedger.createdAt, from), lte(safecoinLedger.createdAt, to)))
      .orderBy(desc(safecoinLedger.createdAt))
      .limit(5000),
    db
      .select({ orgId: safecoinAccounts.orgId, balanceScCents: safecoinAccounts.balanceScCents, orgName: organizations.name, orgSlug: organizations.slug })
      .from(safecoinAccounts)
      .innerJoin(organizations, eq(organizations.id, safecoinAccounts.orgId))
      .orderBy(desc(safecoinAccounts.balanceScCents))
      .limit(1000),
  ]);

  const aggregate = aggregateSafecoinEntries(rows);
  const organizationStats = accounts.map((account) => {
    const orgRows = rows.filter((row) => row.orgId === account.orgId && row.status === "completed");
    return {
      ...account,
      issuedScCents: orgRows.reduce((sum, row) => sum + (ISSUANCE_TYPES.has(row.entryType) && row.amountScCents > 0 ? row.amountScCents : 0), 0),
      spentScCents: orgRows.reduce((sum, row) => sum + (["vpn_charge", "auto_setup_charge"].includes(row.entryType) ? Math.abs(row.amountScCents) : 0), 0),
    };
  });

  return {
    rateFcfaPerSc: settings[0]?.rateFcfaPerSc ?? 100,
    rechargeFeeScCents: settings[0]?.rechargeFeeScCents ?? 0,
    vpnFeeScCents: settings[0]?.vpnFeeScCents ?? 0,
    autoSetupFeeScCents: settings[0]?.autoSetupFeeScCents ?? 0,
    settingsVersion: settings[0]?.version ?? 1,
    settingsUpdatedAt: settings[0]?.updatedAt ?? null,
    kpis: aggregate.kpis,
    daily: aggregate.daily,
    organizations: organizationStats,
    ledger: rows,
  };
}
