import { getDashboardData } from "@/lib/dashboard/queries";
import { apiError, requireMobileSession } from "@/lib/mobile/http";

/**
 * GET /api/mobile/v1/dashboard?from=AAAA-MM-JJ&to=AAAA-MM-JJ
 * Mêmes chiffres que le tableau de bord web (getDashboardData). Par défaut :
 * du 1er du mois à aujourd'hui. Montants en FCFA entiers (suffixe Cents
 * historique : la base stocke des FCFA).
 */
export async function GET(request: Request) {
  const auth = await requireMobileSession();
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const now = new Date();
  const from = parseDay(url.searchParams.get("from")) ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const toDay = parseDay(url.searchParams.get("to")) ?? now;
  if (from > toDay) return apiError(400, "invalid_range", "`from` doit précéder `to`.");
  const to = new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate(), 23, 59, 59, 999);

  const data = await getDashboardData(auth.session.orgId, { from, to });
  return Response.json({ range: { from: from.toISOString(), to: to.toISOString() }, ...data });
}

function parseDay(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}
