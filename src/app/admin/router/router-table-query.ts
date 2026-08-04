export type RouterTableStatusFilter = "all" | "online" | "offline" | "config";

type RouterTableFilters = {
  status: RouterTableStatusFilter;
  query: string;
};

type SearchParamsLike = {
  toString(): string;
};

export function buildRouterTableQuery(
  current: SearchParamsLike,
  { status, query }: RouterTableFilters,
): URLSearchParams {
  const next = new URLSearchParams(current.toString());

  next.delete("status");
  next.delete("q");

  if (status !== "all") next.set("status", status);
  if (query) next.set("q", query);

  return next;
}
