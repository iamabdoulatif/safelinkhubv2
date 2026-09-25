/**
 * Période choisie dans l'URL (?from=AAAA-MM-JJ&to=AAAA-MM-JJ), partagée par le
 * tableau de bord et la page Ventes. Par défaut : du 1er du mois à aujourd'hui.
 */
export function toParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseDay(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type ResolvedRange = {
  from: Date;
  /** Fin de journée incluse (23:59:59.999). */
  to: Date;
  fromParam: string;
  toParam: string;
  activePreset: "month" | "7d" | "30d" | null;
};

export function resolveRange(params: { from?: string; to?: string }, now = new Date()): ResolvedRange {
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  let from = parseDay(params.from) ?? defaultFrom;
  let to = parseDay(params.to) ?? now;
  if (from > to) [from, to] = [to, from];
  const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
  const fromP = toParam(from);
  const toP = toParam(to);
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return toParam(d);
  };
  const activePreset =
    toP !== toParam(now)
      ? null
      : fromP === toParam(defaultFrom)
        ? "month"
        : fromP === daysAgo(6)
          ? "7d"
          : fromP === daysAgo(29)
            ? "30d"
            : null;
  return { from, to: toEnd, fromParam: fromP, toParam: toP, activePreset };
}
