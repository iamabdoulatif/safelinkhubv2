import type { UserControlRow } from "./users-control-center";

type UsersRegisterRow = Pick<UserControlRow, "orgName" | "quotaCategory" | "quotaExpiresAt">;

export type UsersRegisterSummary = {
  attentionCount: number;
  freeCount: number;
  paidCount: number;
  organizationCount: number;
};

export function buildUsersRegisterSummary(
  rows: UsersRegisterRow[],
  now: Date,
): UsersRegisterSummary {
  const nowTime = now.getTime();
  const expiresBefore = nowTime + 30 * 24 * 60 * 60 * 1000;
  let attentionCount = 0;
  let freeCount = 0;
  let paidCount = 0;
  const organizations = new Set<string>();

  for (const row of rows) {
    organizations.add(row.orgName);

    if (row.quotaCategory === "free" || row.quotaCategory === "unlimited") freeCount += 1;
    if (row.quotaCategory === "paid") paidCount += 1;

    if (row.quotaExpiresAt) {
      const expiresAt = new Date(row.quotaExpiresAt).getTime();
      if (expiresAt > nowTime && expiresAt <= expiresBefore) attentionCount += 1;
    }
  }

  return { attentionCount, freeCount, paidCount, organizationCount: organizations.size };
}

export function userMonogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "—";
  if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase("fr-FR");

  return `${words[0][0]}${words[words.length - 1][0]}`.toLocaleUpperCase("fr-FR");
}
