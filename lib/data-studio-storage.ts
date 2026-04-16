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
  const rowChunkSize = 100;

  for (let offset = 0; offset < dataset.rows.length; offset += rowChunkSize) {
    const chunk = dataset.rows.slice(offset, offset + rowChunkSize);

    if (chunk.length === 0) {
      continue;
    }

    const parameters: Array<string | number | boolean | null> = [];
    let parameterIndex = 1;
    const valueGroups = chunk.map((row, rowIndex) => {
      const placeholders = [`$${parameterIndex++}`];
      parameters.push(offset + rowIndex);

      dataset.columns.forEach((column) => {
        placeholders.push(`$${parameterIndex++}`);
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

  const dataset = await prisma.$transaction(async (tx) => {
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
  });

  return {
    id: dataset.id,
    tableName: dataset.tableName,
    expiresAt: dataset.expiresAt.toISOString()
  };
}

export async function storePersistentDataset(input: PersistPermanentDatasetInput) {
  const rows = serializeRows(input.dataset.rows);

  return prisma.$transaction(async (tx) => {
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
  });
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
