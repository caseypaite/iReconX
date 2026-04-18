import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import {
  buildImportColumnSpecsFromMatrix,
  createDatasetFromMatrix,
  createTypedDatasetFromMatrix,
  DATA_STUDIO_ACCEPTED_EXTENSIONS,
  DATA_STUDIO_FILE_LIMIT_BYTES,
  sanitizeImportedTableName,
  type StudioImportColumnType,
  type StudioImportColumnSpec
} from "@/lib/data-studio";
import { requireApiSession } from "@/lib/auth/api";
import {
  PERSISTENT_DATASET_IMPORT_ORIGIN,
  PERSISTENT_IMPORT_SCHEMA,
  getTemporaryDatasetFormat,
  storePersistentDataset,
  storeTemporaryUploadDataset,
  TEMPORARY_ANALYSIS_SCHEMA
} from "@/lib/data-studio-storage";

export const runtime = "nodejs";
const allowedImportColumnTypes = new Set<StudioImportColumnType>(["string", "number", "boolean", "date"]);

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const importLabelField = formData?.get("importLabel");
  const tableNameField = formData?.get("tableName");
  const importToPersistentField = formData?.get("importToPersistent");
  const columnTypesField = formData?.get("columnTypes");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a CSV or Excel file." }, { status: 400 });
  }

  const importLabel = typeof importLabelField === "string" ? importLabelField.trim() : "";
  const tableNameInput = typeof tableNameField === "string" ? tableNameField.trim() : "";
  const importToPersistent = typeof importToPersistentField === "string" && importToPersistentField === "true";
  const normalizedTableName = sanitizeImportedTableName(tableNameInput, importLabel || file.name);
  let typedColumnSpecs: StudioImportColumnSpec[] | null = null;

  if (typeof columnTypesField === "string" && columnTypesField.trim().length > 0) {
    let parsedColumnTypes: unknown;

    try {
      parsedColumnTypes = JSON.parse(columnTypesField) as unknown;
    } catch {
      return NextResponse.json({ error: "Invalid column type configuration." }, { status: 400 });
    }

    if (!Array.isArray(parsedColumnTypes)) {
      return NextResponse.json({ error: "Invalid column type configuration." }, { status: 400 });
    }

    typedColumnSpecs = parsedColumnTypes
      .filter(
        (candidate): candidate is Pick<StudioImportColumnSpec, "key" | "targetType"> =>
          Boolean(candidate) &&
          typeof candidate === "object" &&
          "key" in candidate &&
          typeof candidate.key === "string" &&
          "targetType" in candidate &&
          typeof candidate.targetType === "string" &&
          allowedImportColumnTypes.has(candidate.targetType as StudioImportColumnType)
      )
      .map((candidate) => ({
        key: candidate.key,
        label: candidate.key,
        inferredType: candidate.targetType,
        targetType: candidate.targetType
      }));
  }

  if (file.size > DATA_STUDIO_FILE_LIMIT_BYTES) {
    return NextResponse.json({ error: "Files larger than 20 MB are not allowed." }, { status: 413 });
  }

  const extension = file.name.split(".").pop()?.toLowerCase();

  if (!extension || !DATA_STUDIO_ACCEPTED_EXTENSIONS.includes(extension as (typeof DATA_STUDIO_ACCEPTED_EXTENSIONS)[number])) {
    return NextResponse.json({ error: "Only CSV, XLS, and XLSX files are supported." }, { status: 400 });
  }

  const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), {
    type: "buffer",
    raw: true,
    cellDates: true
  });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return NextResponse.json({ error: "The uploaded file did not contain any readable sheets." }, { status: 400 });
  }

  const worksheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false
  });

  const columnSpecs = typedColumnSpecs && typedColumnSpecs.length > 0 ? typedColumnSpecs : buildImportColumnSpecsFromMatrix(matrix);
  const conversionResult =
    columnSpecs.length > 0
      ? createTypedDatasetFromMatrix(matrix, importLabel || file.name, "upload", columnSpecs, {
          sheet: sheetName,
          uploadedBy: auth.user.email
        })
      : {
          dataset: createDatasetFromMatrix(matrix, importLabel || file.name, "upload", {
            sheet: sheetName,
            uploadedBy: auth.user.email
          }),
          conversionIssues: [] as string[]
        };
  const dataset = conversionResult.dataset;

  try {
    const storedUpload = await storeTemporaryUploadDataset({
      dataset,
      tableName: normalizedTableName,
      sourceFileName: file.name,
      sourceFileFormat: getTemporaryDatasetFormat(extension),
      sourceSheetName: sheetName,
      uploadedById: auth.user.sub
    });

    dataset.metadata = {
      ...(dataset.metadata ?? {}),
      temporaryDatasetId: storedUpload.id,
      temporaryTableName: storedUpload.tableName,
      temporaryDatasetExpiresAt: storedUpload.expiresAt,
      storageSchema: TEMPORARY_ANALYSIS_SCHEMA,
      importConversionIssueCount: conversionResult.conversionIssues.length,
      importConversionIssues:
        conversionResult.conversionIssues.length > 0 ? conversionResult.conversionIssues.join(" | ") : null
    };

    if (importToPersistent) {
      const persistentDataset = await storePersistentDataset({
        dataset,
        tableName: normalizedTableName,
        origin: PERSISTENT_DATASET_IMPORT_ORIGIN,
        sourceLabel: file.name,
        createdById: auth.user.sub,
        metadata: {
          sheet: sheetName,
          uploadedBy: auth.user.email
        }
      });

      dataset.metadata = {
        ...(dataset.metadata ?? {}),
        importedPermanently: true,
        persistentDatasetId: persistentDataset.id,
        persistentTableName: persistentDataset.tableName,
        persistentStorageSchema: PERSISTENT_IMPORT_SCHEMA
      };
    }

    return NextResponse.json({ dataset });
  } catch (error) {
    console.error("Data Studio upload failed.", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to store the uploaded dataset."
      },
      { status: 500 }
    );
  }
}
