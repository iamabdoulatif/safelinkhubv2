import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getSafecoinReport } from "@/lib/safecoin/queries";
import SafecoinConsole from "./SafecoinConsole";

function parseDate(value: string | undefined, fallback: Date) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export default async function SafecoinPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await connection();
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) redirect("/admin");

  const params = await searchParams;
  const now = new Date();
  const from = parseDate(params.from, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const to = parseDate(params.to, now);
  const toEnd = new Date(to);
  toEnd.setUTCHours(23, 59, 59, 999);
  const report = await getSafecoinReport({ from, to: toEnd });
  return <SafecoinConsole report={report} />;
}
