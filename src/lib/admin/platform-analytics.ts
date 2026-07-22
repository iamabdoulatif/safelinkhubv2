export type PlatformSaleKind = "vpn" | "auto_setup";
export type PlatformSaleStatus = "pending" | "approved" | "rejected";

export type PlatformSaleRow = {
  id: string;
  kind: PlatformSaleKind;
  orgId: string;
  orgName: string;
  requesterName: string;
  requesterEmail: string;
  /** Role snapshot for excluding staff-only Auto-Setups from sales. */
  requesterRole?: string | null;
  amountFcfa: number;
  paymentMethod: string;
  service: string | null;
  billingPeriod: string | null;
  status: PlatformSaleStatus | string;
  consumedAt: Date | string | null;
  createdAt: Date | string;
};

export type PlatformAnalyticsRange = { from: Date; to: Date };

export type PlatformAnalyticsReport = ReturnType<typeof summarizePlatformSales>;

export type PlatformDailyPoint = {
  day: string;
  vpnAmountFcfa: number;
  autoSetupAmountFcfa: number;
  vpnCount: number;
  autoSetupCount: number;
};

type Breakdown<T extends string> = {
  [key: string]: { key: T; count: number; amountFcfa: number };
};

function dateValue(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function dayKey(value: Date | string) {
  const date = dateValue(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function enumerateDays(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor <= end && days.length < 366) {
    days.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function percent(part: number, total: number) {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function sortBreakdown<T extends string>(breakdown: Breakdown<T>) {
  return Object.values(breakdown).sort(
    (left, right) => right.amountFcfa - left.amountFcfa || right.count - left.count || left.key.localeCompare(right.key),
  );
}

/**
 * The superadmin can configure staff MikroTik routers without paying. Those
 * runs must never appear as Auto-Setup sales, even if an old/manual request
 * row exists in the authorization table.
 */
export function filterPlatformSalesRows(rows: PlatformSaleRow[]) {
  return rows.filter((row) => row.kind !== "auto_setup" || row.requesterRole !== "superadmin");
}

export function summarizePlatformSales(rows: PlatformSaleRow[], range: PlatformAnalyticsRange) {
  const reportableRows = filterPlatformSalesRows(rows);
  const daily = new Map<string, PlatformDailyPoint>(
    enumerateDays(range.from, range.to).map((day) => [
      day,
      { day, vpnAmountFcfa: 0, autoSetupAmountFcfa: 0, vpnCount: 0, autoSetupCount: 0 },
    ]),
  );
  const methods: Breakdown<string> = {};
  const services: Breakdown<string> = {};
  const approvedRows = reportableRows.filter((row) => row.status === "approved");
  const vpnRows = approvedRows.filter((row) => row.kind === "vpn");
  const autoSetupRows = approvedRows.filter((row) => row.kind === "auto_setup");

  for (const row of approvedRows) {
    const amount = Math.max(0, Number(row.amountFcfa) || 0);
    const point = daily.get(dayKey(row.createdAt));
    if (point) {
      if (row.kind === "vpn") {
        point.vpnAmountFcfa += amount;
        point.vpnCount += 1;
      } else {
        point.autoSetupAmountFcfa += amount;
        point.autoSetupCount += 1;
      }
    }

    const method = methods[row.paymentMethod] ?? { key: row.paymentMethod, count: 0, amountFcfa: 0 };
    method.count += 1;
    method.amountFcfa += amount;
    methods[row.paymentMethod] = method;

    if (row.kind === "vpn" && row.service) {
      const service = services[row.service] ?? { key: row.service, count: 0, amountFcfa: 0 };
      service.count += 1;
      service.amountFcfa += amount;
      services[row.service] = service;
    }
  }

  const totalAmountFcfa = approvedRows.reduce((sum, row) => sum + Math.max(0, Number(row.amountFcfa) || 0), 0);
  const consumedCount = approvedRows.filter((row) => row.consumedAt !== null).length;

  return {
    kpis: {
      totalAmountFcfa,
      vpnAmountFcfa: vpnRows.reduce((sum, row) => sum + Math.max(0, Number(row.amountFcfa) || 0), 0),
      autoSetupAmountFcfa: autoSetupRows.reduce(
        (sum, row) => sum + Math.max(0, Number(row.amountFcfa) || 0),
        0,
      ),
      vpnSalesCount: vpnRows.length,
      autoSetupSalesCount: autoSetupRows.length,
      approvedCount: approvedRows.length,
      pendingCount: reportableRows.filter((row) => row.status === "pending").length,
      rejectedCount: reportableRows.filter((row) => row.status === "rejected").length,
      requestCount: reportableRows.length,
      conversionRate: percent(approvedRows.length, reportableRows.length),
      activationRate: percent(consumedCount, approvedRows.length),
      consumedCount,
      unconsumedApprovedCount: approvedRows.length - consumedCount,
      activeOrganizations: new Set(approvedRows.map((row) => row.orgId)).size,
    },
    daily: [...daily.values()],
    paymentMethods: sortBreakdown(methods).map((item) => ({
      method: item.key,
      count: item.count,
      amountFcfa: item.amountFcfa,
    })),
    services: sortBreakdown(services).map((item) => ({
      service: item.key,
      count: item.count,
      amountFcfa: item.amountFcfa,
    })),
  };
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function kindLabel(kind: PlatformSaleKind) {
  return kind === "vpn" ? "VPN" : "Auto-Setup";
}

export function buildPlatformSalesCsv(rows: PlatformSaleRow[]) {
  const header = [
    "Type",
    "Demandeur",
    "Email",
    "Organisation",
    "Service",
    "Période",
    "Montant FCFA",
    "Moyen de paiement",
    "État",
    "Créé le",
    "Activé le",
  ].join(",");
  const lines = filterPlatformSalesRows(rows).map((row) =>
    [
      kindLabel(row.kind),
      row.requesterName,
      row.requesterEmail,
      row.orgName,
      row.service ?? "",
      row.billingPeriod ?? "",
      row.amountFcfa,
      row.paymentMethod,
      row.status,
      dateValue(row.createdAt).toISOString(),
      row.consumedAt ? dateValue(row.consumedAt).toISOString() : "",
    ]
      .map(csvCell)
      .join(","),
  );
  return `\uFEFF${[header, ...lines].join("\n")}`;
}
