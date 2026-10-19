export function userDirectoryPage<T>(rows: T[], requestedPage: number) {
  const size = 20,
    pageCount = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.max(
    0,
    Math.min(
      Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0,
      pageCount - 1,
    ),
  );
  const start = rows.length ? page * size + 1 : 0,
    end = Math.min((page + 1) * size, rows.length);
  return {
    rows: rows.slice(page * size, (page + 1) * size),
    page,
    pageCount,
    start,
    end,
  };
}
