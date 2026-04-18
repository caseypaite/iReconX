export type SourceDataDictionaryColumnMeaning = {
  schema?: string;
  table?: string;
  name: string;
  meaning: string;
};

export type SourceDataDictionaryRecord = {
  version: 1;
  summary: string;
  columns: SourceDataDictionaryColumnMeaning[];
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeColumnMeaning(value: unknown): SourceDataDictionaryColumnMeaning | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = normalizeString(value.name).trim();

  if (!name) {
    return null;
  }

  return {
    schema: normalizeString(value.schema).trim() || undefined,
    table: normalizeString(value.table).trim() || undefined,
    name,
    meaning: normalizeString(value.meaning).trim()
  };
}

export function parseSourceDataDictionary(raw: string | null | undefined): SourceDataDictionaryRecord {
  const normalized = raw?.trim() ?? "";

  if (!normalized) {
    return {
      version: 1,
      summary: "",
      columns: []
    };
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;

    if (!isRecord(parsed)) {
      throw new Error("Invalid dictionary payload.");
    }

    const columns = Array.isArray(parsed.columns)
      ? parsed.columns
          .map(normalizeColumnMeaning)
          .filter((column): column is SourceDataDictionaryColumnMeaning => column !== null)
      : [];

    return {
      version: 1,
      summary: normalizeString(parsed.summary).trim(),
      columns
    };
  } catch {
    return {
      version: 1,
      summary: normalized,
      columns: []
    };
  }
}

export function serializeSourceDataDictionary(record: SourceDataDictionaryRecord) {
  const normalizedSummary = record.summary.trim();
  const normalizedColumns = record.columns
    .map((column) => ({
      schema: column.schema?.trim() || undefined,
      table: column.table?.trim() || undefined,
      name: column.name.trim(),
      meaning: column.meaning.trim()
    }))
    .filter((column) => column.name && column.meaning);

  if (!normalizedSummary && normalizedColumns.length === 0) {
    return "";
  }

  return JSON.stringify({
    version: 1,
    summary: normalizedSummary,
    columns: normalizedColumns
  });
}

export function hasSourceDataDictionary(raw: string | null | undefined) {
  const parsed = parseSourceDataDictionary(raw);
  return Boolean(parsed.summary || parsed.columns.some((column) => column.meaning));
}

export function getSourceDataDictionaryPreview(raw: string | null | undefined) {
  const parsed = parseSourceDataDictionary(raw);

  if (parsed.summary) {
    return parsed.summary;
  }

  const firstColumnMeaning = parsed.columns.find((column) => column.meaning);

  if (firstColumnMeaning) {
    return `${firstColumnMeaning.name}: ${firstColumnMeaning.meaning}`;
  }

  return "";
}

export function formatSourceDataDictionaryForPrompt(raw: string | null | undefined) {
  const parsed = parseSourceDataDictionary(raw);

  if (!parsed.summary && parsed.columns.length === 0) {
    return null;
  }

  const lines: string[] = [];

  if (parsed.summary) {
    lines.push(`Source summary: ${parsed.summary}`);
  }

  if (parsed.columns.length > 0) {
    lines.push("Column meanings:");

    parsed.columns
      .filter((column) => column.meaning)
      .forEach((column) => {
        const identifier = [column.schema, column.table, column.name].filter(Boolean).join(".");
        lines.push(`- ${identifier || column.name}: ${column.meaning}`);
      });
  }

  return lines.join("\n");
}

export function getSourceDataDictionaryColumnMeaning(args: {
  raw: string | null | undefined;
  schema?: string | null;
  table?: string | null;
  name: string;
}) {
  const parsed = parseSourceDataDictionary(args.raw);
  const normalizedName = args.name.trim().toLowerCase();
  const normalizedSchema = args.schema?.trim().toLowerCase() || "";
  const normalizedTable = args.table?.trim().toLowerCase() || "";

  return (
    parsed.columns.find((column) => {
      if (column.name.trim().toLowerCase() !== normalizedName) {
        return false;
      }

      const columnSchema = column.schema?.trim().toLowerCase() || "";
      const columnTable = column.table?.trim().toLowerCase() || "";

      return columnSchema === normalizedSchema && columnTable === normalizedTable;
    })?.meaning ?? ""
  );
}
