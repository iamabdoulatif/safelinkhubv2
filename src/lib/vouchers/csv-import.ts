import { durationFromProfileName } from "./expiry";

export type CsvVoucherRow = {
  line: number;
  username: string;
  profileName: string | null;
  comment: string | null;
  timeLimit: string | null;
  dataLimit: string | null;
};

export type CsvIssue = {
  line: number;
  message: string;
};

export type PackageProfileOption = {
  id: string;
  durationValue: number;
  durationUnit: string;
};

type CsvRecord = {
  line: number;
  cells: string[];
};

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

function nullable(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function headerSeparator(source: string): "," | ";" {
  const header = source.split(/\r?\n/, 1)[0] ?? "";
  const commas = [...header].filter((char) => char === ",").length;
  const semicolons = [...header].filter((char) => char === ";").length;
  return semicolons > commas ? ";" : ",";
}

/** Parse assez de RFC-4180 pour accepter les commentaires MikHmon entre guillemets. */
function parseRecords(source: string, delimiter: "," | ";"): CsvRecord[] {
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let value = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  const finishRecord = () => {
    cells.push(value);
    if (cells.some((cell) => cell.length > 0)) records.push({ line: recordLine, cells });
    cells = [];
    value = "";
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else if (char === "\r" || char === "\n") {
        if (char === "\r" && next === "\n") index += 1;
        value += "\n";
        line += 1;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(value);
      value = "";
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && next === "\n") index += 1;
      finishRecord();
      line += 1;
      recordLine = line;
    } else {
      value += char;
    }
  }

  if (value.length > 0 || cells.length > 0) finishRecord();
  return records;
}

export function parseMikhmonVoucherCsv(source: string): {
  delimiter: "," | ";";
  rows: CsvVoucherRow[];
  issues: CsvIssue[];
} {
  const cleanSource = source.replace(/^\uFEFF/, "");
  const delimiter = headerSeparator(cleanSource);
  const records = parseRecords(cleanSource, delimiter);
  const header = records.shift();
  const issues: CsvIssue[] = [];

  if (!header) {
    return { delimiter, rows: [], issues: [{ line: 1, message: "Le fichier CSV est vide." }] };
  }

  const columnByName = new Map(
    header.cells.map((cell, index) => [normalizeHeader(cell), index] as const),
  );
  const usernameColumn = columnByName.get("username");
  if (usernameColumn === undefined) {
    return {
      delimiter,
      rows: [],
      issues: [{ line: header.line, message: "La colonne Username est obligatoire." }],
    };
  }

  const profileColumn = columnByName.get("profile");
  const timeLimitColumn = columnByName.get("time limit");
  const dataLimitColumn = columnByName.get("data limit");
  const commentColumn = columnByName.get("comment");
  const usernames = new Set<string>();
  const rows: CsvVoucherRow[] = [];

  for (const record of records) {
    const username = nullable(record.cells[usernameColumn]);
    if (!username) {
      issues.push({ line: record.line, message: "Le code Username est vide." });
      continue;
    }
    if (usernames.has(username)) {
      issues.push({ line: record.line, message: `Le code ${username} est dupliqué dans le fichier.` });
      continue;
    }
    usernames.add(username);
    rows.push({
      line: record.line,
      username,
      profileName: profileColumn === undefined ? null : nullable(record.cells[profileColumn]),
      comment: commentColumn === undefined ? null : nullable(record.cells[commentColumn]),
      timeLimit: timeLimitColumn === undefined ? null : nullable(record.cells[timeLimitColumn]),
      dataLimit: dataLimitColumn === undefined ? null : nullable(record.cells[dataLimitColumn]),
    });
  }

  return { delimiter, rows, issues };
}

export function matchPackageForProfile<T extends PackageProfileOption>(
  profileName: string | null,
  packages: readonly T[],
): T | undefined {
  const duration = durationFromProfileName(profileName);
  if (!duration) return undefined;
  return packages.find(
    (pkg) =>
      pkg.durationValue === duration.durationValue &&
      pkg.durationUnit.trim().toLowerCase() === duration.durationUnit.toLowerCase(),
  );
}
