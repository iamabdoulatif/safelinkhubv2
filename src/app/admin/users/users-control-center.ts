export type UserQuotaCategory = "default" | "free" | "unlimited" | "paid";

export type UserControlRow = {
  id: string;
  name: string;
  email: string;
  orgName: string;
  role: string;
  quotaCategory: UserQuotaCategory;
  quotaLabel: string;
  quotaExpiresAt: string | null;
  createdAt: string;
};

export type UserControlFilter = "all" | "admins" | "superadmins" | "free" | "paid" | "expiring";

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("fr-FR");
}

export function filterUsers(
  rows: UserControlRow[],
  query: string,
  filter: UserControlFilter,
  now = new Date(),
): UserControlRow[] {
  const needle = normalize(query);
  const expiresBefore = now.getTime() + 30 * 24 * 60 * 60 * 1000;

  return rows.filter((row) => {
    const matchesQuery = !needle || normalize(`${row.name} ${row.email} ${row.orgName}`).includes(needle);
    if (!matchesQuery) return false;
    if (filter === "admins") return row.role === "admin";
    if (filter === "superadmins") return row.role === "superadmin";
    if (filter === "free") return row.quotaCategory === "free" || row.quotaCategory === "unlimited";
    if (filter === "paid") return row.quotaCategory === "paid";
    if (filter === "expiring") {
      if (!row.quotaExpiresAt) return false;
      const expiresAt = new Date(row.quotaExpiresAt).getTime();
      return expiresAt > now.getTime() && expiresAt <= expiresBefore;
    }
    return true;
  });
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildUsersCsv(rows: UserControlRow[]): string {
  const header = ["Nom", "Email", "Organisation", "Rôle", "Quota VPN", "Inscrit le"].join(",");
  const lines = rows.map((row) =>
    [row.name, row.email, row.orgName, row.role, row.quotaLabel, row.createdAt]
      .map(csvCell)
      .join(","),
  );
  return `\uFEFF${[header, ...lines].join("\n")}`;
}
