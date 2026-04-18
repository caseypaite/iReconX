import {
  PersistentDatasetOrigin,
  TemporaryDatasetFormat
} from "@prisma/client";

import type { StudioCellValue, StudioColumn, StudioDataset, StudioRow } from "@/lib/data-studio";
import { prisma } from "@/lib/prisma";

const TEMPORARY_UPLOAD_RETENTION_MS = 24 * 60 * 60 * 1000;
export const TEMPORARY_ANALYSIS_SCHEMA = "adhoc_analysis";
export const PERSISTENT_IMPORT_SCHEMA = "import_archive";
export const PERSISTENT_DATASET_IMPORT_ORIGIN = PersistentDatasetOrigin.IMPORT;
const MAX_PREPARED_STATEMENT_PARAMETERS = 32_000;
const DATASET_STORAGE_TRANSACTION_TIMEOUT_MS = 60_000;
const DATASET_STORAGE_TRANSACTION_MAX_WAIT_MS = 10_000;

type PersistTemporaryUploadDatasetInput = {
  dataset: StudioDataset;
  tableName: string;
  sourceFileName: string;
  sourceFileFormat: TemporaryDatasetFormat;
  sourceSheetName?: string;
  uploadedById: string;
};

type PersistPermanentDatasetInput = {
  dataset: StudioDataset;
  tableName: string;
  origin: PersistentDatasetOrigin;
  sourceLabel?: string;
  sourceUri?: string;
  createdById?: string;
  metadata?: Record<string, StudioCellValue>;
};

function serializeColumns(columns: StudioColumn[]) {
  return columns.map((column) => ({
    key: column.key,
    label: column.label,
    kind: column.kind
  }));
}

function serializeRows(rows: StudioRow[]) {
  return rows.map((row, rowIndex) => ({
    rowIndex,
    payload: Object.entries(row).reduce<Record<string, StudioCellValue>>((payload, [key, value]) => {
      payload[key] = value;
      return payload;
    }, {})
  }));
}

function mergeMetadata(
  primary?: Record<string, StudioCellValue>,
  secondary?: Record<string, StudioCellValue>
) {
  if (!primary && !secondary) {
    return undefined;
  }

  return {
    ...(primary ?? {}),
    ...(secondary ?? {})
  };
}

function deserializeColumns(value: unknown): StudioColumn[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (column): column is StudioColumn =>
        Boolean(column) &&
        typeof column === "object" &&
        "key" in column &&
        typeof column.key === "string" &&
        "label" in column &&
        typeof column.label === "string" &&
        "kind" in column &&
        typeof column.kind === "string"
    )
    .map((column) => ({
      key: column.key,
      label: column.label,
      kind: column.kind
    }));
}

function deserializeMetadata(value: unknown): Record<string, StudioCellValue> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return Object.entries(value).reduce<Record<string, StudioCellValue>>((metadata, [key, rawValue]) => {
    if (
      rawValue === null ||
      typeof rawValue === "string" ||
      typeof rawValue === "number" ||
      typeof rawValue === "boolean"
    ) {
      metadata[key] = rawValue;
    }

    return metadata;
  }, {});
}

function deserializeRowPayload(value: unknown): StudioRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<StudioRow>((row, [key, rawValue]) => {
    if (
      rawValue === null ||
      typeof rawValue === "string" ||
      typeof rawValue === "number" ||
      typeof rawValue === "boolean"
    ) {
      row[key] = rawValue;
    } else {
      row[key] = rawValue === undefined ? null : String(rawValue);
    }

    return row;
  }, {});
}

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function getColumnSqlType(kind: StudioColumn["kind"]) {
  switch (kind) {
    case "number":
      return "DOUBLE PRECISION";
    case "boolean":
      return "BOOLEAN";
    case "date":
      return "TIMESTAMPTZ";
    default:
      return "TEXT";
  }
}

function normalizeCellForInsert(value: StudioCellValue, kind: StudioColumn["kind"]) {
  if (value === null || value === undefined) {
    return null;
  }

  if (kind === "number") {
    return typeof value === "number" ? value : Number(value);
  }

  if (kind === "boolean") {
    return typeof value === "boolean" ? value : Boolean(value);
  }

  return String(value);
}

function getPhysicalInsertChunkSize(columnCount: number) {
  const parametersPerRow = columnCount + 1;
  return Math.max(1, Math.floor(MAX_PREPARED_STATEMENT_PARAMETERS / parametersPerRow));
}

function getInsertPlaceholderSql(parameterIndex: number, kind?: StudioColumn["kind"]) {
  if (kind === "date") {
    return `$${parameterIndex}::TIMESTAMPTZ`;
  }

  return `$${parameterIndex}`;
}

async function ensureTableDoesNotExist(
  tx: Pick<typeof prisma, "$queryRaw">,
  schema: string,
  tableName: string
) {
  const rows = await tx.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = ${schema}
      AND table_name = ${tableName}
    ) AS "exists"
  `;

  if (rows[0]?.exists) {
    throw new Error(`A table named "${tableName}" already exists in schema "${schema}".`);
  }
}

async function physicalTableExists(
  tx: Pick<typeof prisma, "$queryRaw">,
  schema: string,
  tableName: string
) {
  const rows = await tx.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = ${schema}
      AND table_name = ${tableName}
    ) AS "exists"
  `;

  return rows[0]?.exists ?? false;
}

async function dropPhysicalTable(
  tx: Pick<typeof prisma, "$executeRawUnsafe">,
  schema: string,
  tableName: string
) {
  await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS ${quoteIdentifier(schema)}.${quoteIdentifier(tableName)}`);
}

async function createPhysicalDatasetTable(
  tx: Pick<typeof prisma, "$executeRawUnsafe" | "$queryRaw">,
  schema: string,
  tableName: string,
  dataset: StudioDataset
) {
  await ensureTableDoesNotExist(tx, schema, tableName);

  const columnDefinitions = [
    `${quoteIdentifier("_row_index")} INTEGER NOT NULL`,
    ...dataset.columns.map((column) => `${quoteIdentifier(column.key)} ${getColumnSqlType(column.kind)}`)
  ];

  await tx.$executeRawUnsafe(
    `CREATE TABLE ${quoteIdentifier(schema)}.${quoteIdentifier(tableName)} (${columnDefinitions.join(", ")})`
  );

  const insertColumns = ["_row_index", ...dataset.columns.map((column) => column.key)];
  const insertColumnSql = insertColumns.map((column) => quoteIdentifier(column)).join(", ");
  const rowChunkSize = getPhysicalInsertChunkSize(dataset.columns.length);

  for (let offset = 0; offset < dataset.rows.length; offset += rowChunkSize) {
    const chunk = dataset.rows.slice(offset, offset + rowChunkSize);

    if (chunk.length === 0) {
      continue;
    }

    const parameters: Array<string | number | boolean | null> = [];
    let parameterIndex = 1;
    const valueGroups = chunk.map((row, rowIndex) => {
      const placeholders = [getInsertPlaceholderSql(parameterIndex++)];
      parameters.push(offset + rowIndex);

      dataset.columns.forEach((column) => {
        placeholders.push(getInsertPlaceholderSql(parameterIndex++, column.kind));
        parameters.push(normalizeCellForInsert(row[column.key] ?? null, column.kind));
      });

      return `(${placeholders.join(", ")})`;
    });

    await tx.$executeRawUnsafe(
      `INSERT INTO ${quoteIdentifier(schema)}.${quoteIdentifier(tableName)} (${insertColumnSql}) VALUES ${valueGroups.join(", ")}`,
      ...parameters
    );
  }
}

export async function storeTemporaryUploadDataset(
  input: PersistTemporaryUploadDatasetInput
) {
  const expiresAt = new Date(Date.now() + TEMPORARY_UPLOAD_RETENTION_MS);
  const rows = serializeRows(input.dataset.rows);

  const dataset = await prisma.$transaction(
    async (tx) => {
      const expiredDatasets = await tx.temporaryAnalysisDataset.findMany({
        where: {
          expiresAt: {
            lte: new Date()
          }
        },
        select: {
          id: true,
          tableName: true
        }
      });

      for (const expiredDataset of expiredDatasets) {
        await dropPhysicalTable(tx, TEMPORARY_ANALYSIS_SCHEMA, expiredDataset.tableName);
      }

      if (expiredDatasets.length > 0) {
        await tx.temporaryAnalysisDataset.deleteMany({
          where: {
            id: {
              in: expiredDatasets.map((datasetItem) => datasetItem.id)
            }
          }
        });
      }

      const createdDataset = await tx.temporaryAnalysisDataset.create({
        data: {
          label: input.dataset.label,
          tableName: input.tableName,
          sourceFileName: input.sourceFileName,
          sourceFileFormat: input.sourceFileFormat,
          sourceSheetName: input.sourceSheetName,
          rowCount: input.dataset.rowCount,
          columnCount: input.dataset.columns.length,
          columns: serializeColumns(input.dataset.columns),
          metadata: input.dataset.metadata,
          uploadedById: input.uploadedById,
          expiresAt
        }
      });

      await createPhysicalDatasetTable(tx, TEMPORARY_ANALYSIS_SCHEMA, input.tableName, input.dataset);

      if (rows.length > 0) {
        await tx.temporaryAnalysisDatasetRow.createMany({
          data: rows.map((row) => ({
            datasetId: createdDataset.id,
            rowIndex: row.rowIndex,
            payload: row.payload
          }))
        });
      }

      return createdDataset;
    },
    {
      timeout: DATASET_STORAGE_TRANSACTION_TIMEOUT_MS,
      maxWait: DATASET_STORAGE_TRANSACTION_MAX_WAIT_MS
    }
  );

  return {
    id: dataset.id,
    tableName: dataset.tableName,
    expiresAt: dataset.expiresAt.toISOString()
  };
}

export async function storePersistentDataset(input: PersistPermanentDatasetInput) {
  const rows = serializeRows(input.dataset.rows);

  return prisma.$transaction(
    async (tx) => {
      const createdDataset = await tx.persistentDataset.create({
        data: {
          label: input.dataset.label,
          tableName: input.tableName,
          origin: input.origin,
          sourceLabel: input.sourceLabel,
          sourceUri: input.sourceUri,
          rowCount: input.dataset.rowCount,
          columnCount: input.dataset.columns.length,
          columns: serializeColumns(input.dataset.columns),
          metadata: mergeMetadata(input.dataset.metadata, input.metadata),
          createdById: input.createdById
        }
      });

      await createPhysicalDatasetTable(tx, PERSISTENT_IMPORT_SCHEMA, input.tableName, input.dataset);

      if (rows.length > 0) {
        await tx.persistentDatasetRow.createMany({
          data: rows.map((row) => ({
            datasetId: createdDataset.id,
            rowIndex: row.rowIndex,
            payload: row.payload
          }))
        });
      }

      return createdDataset;
    },
    {
      timeout: DATASET_STORAGE_TRANSACTION_TIMEOUT_MS,
      maxWait: DATASET_STORAGE_TRANSACTION_MAX_WAIT_MS
    }
  );
}

export async function loadPersistentDataset(datasetId: string): Promise<StudioDataset | null> {
  const dataset = await prisma.persistentDataset.findUnique({
    where: { id: datasetId },
    select: {
      id: true,
      label: true,
      tableName: true,
      rowCount: true,
      columns: true,
      metadata: true,
      rows: {
        orderBy: { rowIndex: "asc" },
        select: {
          payload: true
        }
      }
    }
  });

  if (!dataset) {
    return null;
  }

  return {
    label: dataset.label,
    sourceKind: "upload",
    rowCount: dataset.rowCount,
    columns: deserializeColumns(dataset.columns),
    rows: dataset.rows.map((row) => deserializeRowPayload(row.payload)),
    metadata: {
      ...(deserializeMetadata(dataset.metadata) ?? {}),
      persistentDatasetId: dataset.id,
      persistentTableName: dataset.tableName,
      persistentStorageSchema: PERSISTENT_IMPORT_SCHEMA,
      importedPermanently: true
    }
  };
}

export async function ensurePersistentDatasetPhysicalTable(datasetId: string) {
  const dataset = await prisma.persistentDataset.findUnique({
    where: { id: datasetId },
    select: {
      id: true,
      label: true,
      tableName: true,
      rowCount: true,
      columns: true,
      metadata: true,
      rows: {
        orderBy: { rowIndex: "asc" },
        select: {
          payload: true
        }
      }
    }
  });

  if (!dataset) {
    throw new Error("Persistent dataset not found.");
  }

  const exists = await physicalTableExists(prisma, PERSISTENT_IMPORT_SCHEMA, dataset.tableName);

  if (exists) {
    return {
      schema: PERSISTENT_IMPORT_SCHEMA,
      tableName: dataset.tableName
    };
  }

  const reconstructedDataset: StudioDataset = {
    label: dataset.label,
    sourceKind: "upload",
    rowCount: dataset.rowCount,
    columns: deserializeColumns(dataset.columns),
    rows: dataset.rows.map((row) => deserializeRowPayload(row.payload)),
    metadata: deserializeMetadata(dataset.metadata)
  };

  await prisma.$transaction(
    async (tx) => {
      const tableAlreadyExists = await physicalTableExists(tx, PERSISTENT_IMPORT_SCHEMA, dataset.tableName);

      if (tableAlreadyExists) {
        return;
      }

      await createPhysicalDatasetTable(tx, PERSISTENT_IMPORT_SCHEMA, dataset.tableName, reconstructedDataset);
    },
    {
      timeout: DATASET_STORAGE_TRANSACTION_TIMEOUT_MS,
      maxWait: DATASET_STORAGE_TRANSACTION_MAX_WAIT_MS
    }
  );

  return {
    schema: PERSISTENT_IMPORT_SCHEMA,
    tableName: dataset.tableName
  };
}

export function getTemporaryDatasetFormat(
  extension: string
): TemporaryDatasetFormat {
  switch (extension) {
    case "csv":
      return TemporaryDatasetFormat.CSV;
    case "xls":
      return TemporaryDatasetFormat.XLS;
    case "xlsx":
      return TemporaryDatasetFormat.XLSX;
    default:
      throw new Error(`Unsupported upload extension: ${extension}`);
  }
}
