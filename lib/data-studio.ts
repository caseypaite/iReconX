export const DATA_STUDIO_FILE_LIMIT_BYTES = 20 * 1024 * 1024;
export const DATA_STUDIO_ACCEPTED_EXTENSIONS = ["csv", "xls", "xlsx"] as const;

export type StudioCellValue = string | number | boolean | null;

export type StudioRow = Record<string, StudioCellValue>;

export type StudioColumnKind = "string" | "number" | "boolean" | "date" | "mixed" | "empty";
export type StudioImportColumnType = "string" | "number" | "boolean" | "date";

export type StudioColumn = {
  key: string;
  label: string;
  kind: StudioColumnKind;
};

export type StudioImportColumnSpec = {
  key: string;
  label: string;
  inferredType: StudioImportColumnType;
  targetType: StudioImportColumnType;
};

export type StudioDatasetSourceKind = "upload" | "data-source-catalog";

export type StudioDataset = {
  label: string;
  sourceKind: StudioDatasetSourceKind;
  rowCount: number;
  columns: StudioColumn[];
  rows: StudioRow[];
  metadata?: Record<string, StudioCellValue>;
};

export type AccessibleStudioSource = {
  id: string;
  name: string;
  description: string;
  type: string;
  owner: string;
  accessScope: string;
  sharedUsers: number;
  createdAt: string;
  updatedAt: string;
};

export type StudioFilter = {
  id: string;
  column: string;
  operator: "contains" | "equals" | "gt" | "lt" | "is-empty";
  value: string;
};

export type StudioAggregation = "count" | "sum" | "avg" | "min" | "max";

export type StudioSummaryConfig = {
  groupBy?: string;
  aggregation: StudioAggregation;
  metricColumn?: string;
};

export type StudioPivotConfig = {
  rowField?: string;
  columnField?: string;
  aggregation: StudioAggregation;
  valueField?: string;
};

const IMPORT_TABLE_NAME_MAX_LENGTH = 48;

function normalizeCellValue(value: unknown): StudioCellValue {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function normalizeHeader(value: unknown, index: number, seen: Set<string>) {
  const base = String(value ?? "").trim() || `Column ${index + 1}`;
  let candidate = base;
  let suffix = 2;

  while (seen.has(candidate)) {
    candidate = `${base} (${suffix})`;
    suffix += 1;
  }

  seen.add(candidate);
  return candidate;
}

function inferColumnKind(values: StudioCellValue[]): StudioColumnKind {
  const populated = values.filter((value) => value !== null);

  if (populated.length === 0) {
    return "empty";
  }

  if (populated.every((value) => typeof value === "number")) {
    return "number";
  }

  if (populated.every((value) => typeof value === "boolean")) {
    return "boolean";
  }

  if (
    populated.every(
      (value) =>
        typeof value === "string" &&
        !Number.isNaN(Date.parse(value)) &&
        value.length >= 8
    )
  ) {
    return "date";
  }

  if (populated.every((value) => typeof value === "string")) {
    return "string";
  }

  return "mixed";
}

function normalizeImportColumnType(kind: StudioColumnKind): StudioImportColumnType {
  if (kind === "number" || kind === "boolean" || kind === "date") {
    return kind;
  }

  return "string";
}

export function sanitizeImportedTableName(rawValue: string, fallbackValue = "imported_data") {
  const sanitized = rawValue
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const fallback = fallbackValue
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "imported_data";
  const normalized = sanitized || fallback;
  const prefixed = /^[a-z_]/.test(normalized) ? normalized : `t_${normalized}`;

  return prefixed.slice(0, IMPORT_TABLE_NAME_MAX_LENGTH).replace(/_+$/g, "") || "imported_data";
}

function convertBooleanLikeValue(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "yes", "y", "1"].includes(normalized)) {
      return true;
    }

    if (["false", "no", "n", "0"].includes(normalized)) {
      return false;
    }
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }
  }

  return null;
}

function convertValueToType(value: unknown, targetType: StudioImportColumnType) {
  if (value === undefined || value === null || value === "") {
    return {
      value: null as StudioCellValue,
      failed: false
    };
  }

  if (targetType === "string") {
    return {
      value: normalizeCellValue(value),
      failed: false
    };
  }

  if (targetType === "number") {
    if (typeof value === "number" && Number.isFinite(value)) {
      return {
        value,
        failed: false
      };
    }

    if (typeof value === "string") {
      const parsed = Number(value.trim());

      if (Number.isFinite(parsed)) {
        return {
          value: parsed,
          failed: false
        };
      }
    }

    return {
      value: null as StudioCellValue,
      failed: true
    };
  }

  if (targetType === "boolean") {
    const converted = convertBooleanLikeValue(value);

    return {
      value: converted,
      failed: converted === null
    };
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      value: value.toISOString(),
      failed: false
    };
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      return {
        value: parsed.toISOString(),
        failed: false
      };
    }
  }

  return {
    value: null as StudioCellValue,
    failed: true
  };
}

function buildColumns(rows: StudioRow[]) {
  const keys = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>())
  );

  return keys.map((key) => ({
    key,
    label: key,
    kind: inferColumnKind(rows.map((row) => row[key] ?? null))
  }));
}

export function createDatasetFromRecords(
  records: Array<Record<string, unknown>>,
  label: string,
  sourceKind: StudioDatasetSourceKind,
  metadata?: Record<string, StudioCellValue>
): StudioDataset {
  const keys = Array.from(
    records.reduce((set, record) => {
      Object.keys(record).forEach((key) => set.add(key));
      return set;
    }, new Set<string>())
  );

  const rows = records.map((record) =>
    keys.reduce<StudioRow>((row, key) => {
      row[key] = normalizeCellValue(record[key]);
      return row;
    }, {})
  );

  return {
    label,
    sourceKind,
    rowCount: rows.length,
    columns: buildColumns(rows),
    rows,
    metadata
  };
}

export function buildImportColumnSpecsFromMatrix(matrix: unknown[][]): StudioImportColumnSpec[] {
  if (matrix.length === 0) {
    return [];
  }

  const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  const seenHeaders = new Set<string>();
  const headers = Array.from({ length: width }, (_, index) =>
    normalizeHeader(matrix[0]?.[index], index, seenHeaders)
  );

  return headers.map((header, index) => {
    const values = matrix
      .slice(1)
      .map((row) => normalizeCellValue(row[index]))
      .filter((value) => value !== null);
    const inferredType = normalizeImportColumnType(inferColumnKind(values));

    return {
      key: header,
      label: header,
      inferredType,
      targetType: inferredType
    };
  });
}

export function createTypedDatasetFromMatrix(
  matrix: unknown[][],
  label: string,
  sourceKind: StudioDatasetSourceKind,
  columnSpecs: StudioImportColumnSpec[],
  metadata?: Record<string, StudioCellValue>
): {
  dataset: StudioDataset;
  conversionIssues: string[];
} {
  if (matrix.length === 0) {
    return {
      dataset: {
        label,
        sourceKind,
        rowCount: 0,
        columns: [],
        rows: [],
        metadata
      },
      conversionIssues: []
    };
  }

  const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  const seenHeaders = new Set<string>();
  const headers = Array.from({ length: width }, (_, index) =>
    normalizeHeader(matrix[0]?.[index], index, seenHeaders)
  );
  const specsByKey = new Map(columnSpecs.map((spec) => [spec.key, spec]));
  const conversionFailureCounts = new Map<string, number>();

  const records = matrix
    .slice(1)
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""))
    .map((row) =>
      headers.reduce<Record<string, StudioCellValue>>((record, header, index) => {
        const spec = specsByKey.get(header) ?? {
          key: header,
          label: header,
          inferredType: "string" as StudioImportColumnType,
          targetType: "string" as StudioImportColumnType
        };
        const converted = convertValueToType(row[index], spec.targetType);

        if (converted.failed) {
          conversionFailureCounts.set(spec.label, (conversionFailureCounts.get(spec.label) ?? 0) + 1);
        }

        record[spec.label] = converted.value;
        return record;
      }, {})
    );

  return {
    dataset: createDatasetFromRecords(records, label, sourceKind, metadata),
    conversionIssues: Array.from(conversionFailureCounts.entries()).map(
      ([columnLabel, count]) => `${columnLabel}: ${count} value${count === 1 ? "" : "s"} could not be converted and were set to null.`
    )
  };
}

export function createDatasetFromMatrix(
  matrix: unknown[][],
  label: string,
  sourceKind: StudioDatasetSourceKind,
  metadata?: Record<string, StudioCellValue>
): StudioDataset {
  if (matrix.length === 0) {
    return {
      label,
      sourceKind,
      rowCount: 0,
      columns: [],
      rows: [],
      metadata
    };
  }

  const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  const seenHeaders = new Set<string>();
  const headers = Array.from({ length: width }, (_, index) =>
    normalizeHeader(matrix[0]?.[index], index, seenHeaders)
  );

  const records = matrix
    .slice(1)
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""))
    .map((row) =>
      headers.reduce<Record<string, unknown>>((record, header, index) => {
        record[header] = row[index];
        return record;
      }, {})
    );

  return createDatasetFromRecords(records, label, sourceKind, metadata);
}

export function buildSourceCatalogDataset(
  sources: AccessibleStudioSource[],
  label = "Governed data sources"
): StudioDataset {
  return createDatasetFromRecords(
    sources.map((source) => ({
      Name: source.name,
      Type: source.type,
      Description: source.description,
      Owner: source.owner,
      Scope: source.accessScope,
      "Shared Users": source.sharedUsers,
      Created: source.createdAt,
      Updated: source.updatedAt,
      Identifier: source.id
    })),
    label,
    "data-source-catalog",
    { sourceCount: sources.length }
  );
}

function matchesFilterValue(rowValue: StudioCellValue, operator: StudioFilter["operator"], value: string) {
  if (operator === "is-empty") {
    return rowValue === null || String(rowValue).trim() === "";
  }

  if (rowValue === null) {
    return false;
  }

  const rowText = String(rowValue).toLowerCase();
  const filterText = value.toLowerCase();

  if (operator === "contains") {
    return rowText.includes(filterText);
  }

  if (operator === "equals") {
    return rowText === filterText;
  }

  const rowNumber = typeof rowValue === "number" ? rowValue : Number(rowValue);
  const filterNumber = Number(value);

  if (Number.isFinite(rowNumber) && Number.isFinite(filterNumber)) {
    return operator === "gt" ? rowNumber > filterNumber : rowNumber < filterNumber;
  }

  const rowDate = Date.parse(String(rowValue));
  const filterDate = Date.parse(value);

  if (!Number.isNaN(rowDate) && !Number.isNaN(filterDate)) {
    return operator === "gt" ? rowDate > filterDate : rowDate < filterDate;
  }

  return operator === "gt" ? rowText > filterText : rowText < filterText;
}

export function applyStudioFilters(rows: StudioRow[], filters: StudioFilter[]) {
  const activeFilters = filters.filter((filter) => filter.column && (filter.operator === "is-empty" || filter.value.trim() !== ""));

  if (activeFilters.length === 0) {
    return rows;
  }

  return rows.filter((row) =>
    activeFilters.every((filter) => matchesFilterValue(row[filter.column] ?? null, filter.operator, filter.value))
  );
}

function numericMetricValues(rows: StudioRow[], metricColumn?: string) {
  if (!metricColumn) {
    return [];
  }

  return rows
    .map((row) => row[metricColumn])
    .map((value) => (typeof value === "number" ? value : Number(value)))
    .filter((value) => Number.isFinite(value));
}

function aggregateMetric(rows: StudioRow[], aggregation: StudioAggregation, metricColumn?: string) {
  if (aggregation === "count") {
    return rows.length;
  }

  const values = numericMetricValues(rows, metricColumn);

  if (values.length === 0) {
    return null;
  }

  if (aggregation === "sum") {
    return values.reduce((total, value) => total + value, 0);
  }

  if (aggregation === "avg") {
    return values.reduce((total, value) => total + value, 0) / values.length;
  }

  if (aggregation === "min") {
    return Math.min(...values);
  }

  return Math.max(...values);
}

export function buildStudioSummary(rows: StudioRow[], config: StudioSummaryConfig) {
  const metricLabel =
    config.aggregation === "count"
      ? "Count"
      : `${config.aggregation.toUpperCase()} ${config.metricColumn ?? "Value"}`;

  if (!config.groupBy) {
    return [
      {
        Group: "All rows",
        [metricLabel]: aggregateMetric(rows, config.aggregation, config.metricColumn)
      }
    ];
  }

  const groups = new Map<string, StudioRow[]>();

  rows.forEach((row) => {
    const key = row[config.groupBy!] === null ? "Empty" : String(row[config.groupBy!]);
    const existing = groups.get(key) ?? [];
    existing.push(row);
    groups.set(key, existing);
  });

  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([group, groupRows]) => ({
      [config.groupBy!]: group,
      [metricLabel]: aggregateMetric(groupRows, config.aggregation, config.metricColumn)
    }));
}

export function buildStudioPivot(rows: StudioRow[], config: StudioPivotConfig) {
  if (!config.rowField || !config.columnField) {
    return {
      columns: [],
      rows: []
    };
  }

  const rowKeys = Array.from(
    new Set(rows.map((row) => (row[config.rowField!] === null ? "Empty" : String(row[config.rowField!]))))
  ).sort((left, right) => left.localeCompare(right));
  const columnKeys = Array.from(
    new Set(rows.map((row) => (row[config.columnField!] === null ? "Empty" : String(row[config.columnField!]))))
  ).sort((left, right) => left.localeCompare(right));

  const pivotRows = rowKeys.map<StudioRow>((rowKey) => {
    const record: StudioRow = {
      [config.rowField!]: rowKey
    };

    columnKeys.forEach((columnKey) => {
      const scopedRows = rows.filter((row) => {
        const currentRowValue = row[config.rowField!] === null ? "Empty" : String(row[config.rowField!]);
        const currentColumnValue = row[config.columnField!] === null ? "Empty" : String(row[config.columnField!]);
        return currentRowValue === rowKey && currentColumnValue === columnKey;
      });

      record[columnKey] = aggregateMetric(scopedRows, config.aggregation, config.valueField);
    });

    return record;
  });

  return {
    columns: [config.rowField, ...columnKeys],
    rows: pivotRows
  };
}
