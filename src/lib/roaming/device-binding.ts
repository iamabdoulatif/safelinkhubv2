export type DeviceBindingRouterStatus = "PENDING" | "SYNCED" | "ERROR";

export type DeviceBindingRouterState = {
  routerId: string;
  status: DeviceBindingRouterStatus;
  lastError: string | null;
};

export function normalizeRoamingMac(raw: string): string {
  const hex = (raw ?? "").replace(/[^0-9a-f]/gi, "").toUpperCase();
  return hex.length === 12 ? (hex.match(/.{2}/g) ?? []).join(":") : "";
}

export function summarizeBindingRouters(rows: DeviceBindingRouterState[]) {
  return {
    total: rows.length,
    synced: rows.filter((row) => row.status === "SYNCED").length,
    pending: rows.filter((row) => row.status !== "SYNCED").length,
    errors: rows.flatMap((row) => (row.status === "ERROR" && row.lastError ? [row.lastError] : [])),
  };
}
