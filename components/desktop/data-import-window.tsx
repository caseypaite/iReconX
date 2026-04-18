"use client";

import { FileUp } from "lucide-react";
import { ChangeEvent, useEffect, useState } from "react";
import * as XLSX from "xlsx";

import {
  buildImportColumnSpecsFromMatrix,
  createTypedDatasetFromMatrix,
  DATA_STUDIO_FILE_LIMIT_BYTES,
  sanitizeImportedTableName,
  type StudioImportColumnSpec,
  type StudioDataset
} from "@/lib/data-studio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HoverSubtitleTitle } from "@/components/ui/hover-subtitle-title";
import { Input } from "@/components/ui/input";
import { useStudioWorkspaceStore } from "@/lib/stores/studio-workspace";

type ImportWizardStep = 1 | 2 | 3 | 4;

const selectClassName =
  "w-full rounded-none border border-white/10 bg-slate-950/50 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-400";
const compactCardClassName = "rounded-none p-3";
const compactButtonClassName = "h-auto rounded-none px-2 py-1 text-[11px]";
const compactBadgeClassName = "rounded-none px-1.5 py-0.5 text-[10px]";
const previewSampleRowLimit = 40;

function ImportPreviewTable({
  rows,
  columns,
  columnSpecs,
  onTypeChange,
  emptyMessage
}: {
  rows: Array<Record<string, string | number | boolean | null>>;
  columns: Array<{ key: string; label: string }>;
  columnSpecs: StudioImportColumnSpec[];
  onTypeChange: (columnKey: string, targetType: StudioImportColumnSpec["targetType"]) => void;
  emptyMessage: string;
}) {
  if (rows.length === 0 || columns.length === 0) {
    return (
      <div className="rounded-none border border-dashed border-white/10 bg-slate-950/20 px-3 py-6 text-center text-xs text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  const columnSpecMap = new Map(columnSpecs.map((column) => [column.key, column]));

  return (
    <div className="max-h-[28rem] overflow-auto rounded-none border border-white/10">
      <table className="min-w-max divide-y divide-white/10 text-[11px] leading-tight text-slate-200">
        <colgroup>
          <col className="w-14" />
          {columns.map((column) => (
            <col key={column.key} className="w-48 min-w-48" />
          ))}
        </colgroup>
        <thead className="bg-white/5">
          <tr>
            <th className="sticky left-0 top-0 z-20 w-12 border-r border-white/10 bg-slate-950/95 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Row
            </th>
            {columns.map((column) => {
              const spec = columnSpecMap.get(column.key);
              return (
                <th key={column.key} className="border-r border-white/5 px-2 py-2 align-top text-left last:border-r-0">
                  <div className="space-y-1">
                    <span className="block truncate text-[11px] font-semibold normal-case text-white" title={column.label}>
                      {column.label}
                    </span>
                    <span className="block text-[10px] font-normal normal-case text-slate-400">
                      {`Detected as ${spec?.inferredType ?? "string"}`}
                    </span>
                  </div>
                </th>
              );
            })}
          </tr>
          <tr className="border-t border-white/10 bg-slate-950/70">
            <th className="sticky left-0 z-20 border-r border-white/10 bg-slate-950/95 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Type
            </th>
            {columns.map((column) => {
              const spec = columnSpecMap.get(column.key);

              return (
                <th key={`${column.key}-type`} className="border-r border-white/5 px-2 py-2 align-top last:border-r-0">
                  <select
                    className={selectClassName}
                    onChange={(event) =>
                      onTypeChange(column.key, event.target.value as StudioImportColumnSpec["targetType"])
                    }
                    value={spec?.targetType ?? "string"}
                  >
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                    <option value="date">Date</option>
                  </select>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((row, index) => (
            <tr key={`${index}-${String(row[columns[0]?.key] ?? "row")}`} className="bg-slate-950/20">
              <td className="sticky left-0 border-r border-white/10 bg-slate-950/95 px-2 py-1.5 align-top text-slate-500">
                {index + 1}
              </td>
              {columns.map((column) => (
                <td key={column.key} className="px-2 py-1.5 align-top text-slate-200">
                  <span className="block max-w-[200px] truncate" title={row[column.key] === null ? "" : String(row[column.key])}>
                    {row[column.key] === null ? <span className="text-slate-500">-</span> : String(row[column.key])}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DataImportWindow() {
  const setWorkspaceDataset = useStudioWorkspaceStore((state) => state.setDataset);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importConsoleEntries, setImportConsoleEntries] = useState<string[]>([]);
  const [importWizardStep, setImportWizardStep] = useState<ImportWizardStep>(1);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSheetName, setImportSheetName] = useState("");
  const [importMatrix, setImportMatrix] = useState<unknown[][]>([]);
  const [importColumnSpecs, setImportColumnSpecs] = useState<StudioImportColumnSpec[]>([]);
  const [importPreviewDataset, setImportPreviewDataset] = useState<StudioDataset | null>(null);
  const [importConversionIssues, setImportConversionIssues] = useState<string[]>([]);
  const [importLabel, setImportLabel] = useState("");
  const [importTableName, setImportTableName] = useState("");
  const [importToPersistent, setImportToPersistent] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const previewColumns = importColumnSpecs.map((column) => ({ key: column.key, label: column.label }));
  const previewRows = (importPreviewDataset?.rows ?? []).slice(0, previewSampleRowLimit).map((row) =>
    previewColumns.reduce<Record<string, string | number | boolean | null>>((accumulator, column) => {
      accumulator[column.key] = row[column.key] ?? null;
      return accumulator;
    }, {})
  );

  function appendImportConsoleEntry(message: string) {
    const timestamp = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    setImportConsoleEntries((current) => [...current.slice(-19), `[${timestamp}] ${message}`]);
  }

  useEffect(() => {
    if (!importFile || importMatrix.length === 0 || importColumnSpecs.length === 0) {
      setImportPreviewDataset(null);
      setImportConversionIssues([]);
      return;
    }

    const preview = createTypedDatasetFromMatrix(
      importMatrix,
      importLabel.trim() || importFile.name,
      "upload",
      importColumnSpecs,
      {
        sheet: importSheetName
      }
    );

    setImportPreviewDataset(preview.dataset);
    setImportConversionIssues(preview.conversionIssues);
  }, [importColumnSpecs, importFile, importLabel, importMatrix, importSheetName]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setImportConsoleEntries([]);

    if (file.size > DATA_STUDIO_FILE_LIMIT_BYTES) {
      const message = "Files larger than 20 MB are not allowed.";
      appendImportConsoleEntry(`[inspect] ${file.name}: ${message}`);
      setError(message);
      event.target.value = "";
      return;
    }

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        raw: true,
        cellDates: true
      });
      const sheetName = workbook.SheetNames[0];

      if (!sheetName) {
        throw new Error("The uploaded file did not contain any readable sheets.");
      }

      const worksheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: false
      });

      setImportFile(file);
      setImportSheetName(sheetName);
      setImportMatrix(matrix);
      setImportColumnSpecs(buildImportColumnSpecsFromMatrix(matrix));
      setImportLabel(file.name.replace(/\.[^.]+$/, "") || file.name);
      setImportTableName(sanitizeImportedTableName(file.name.replace(/\.[^.]+$/, "") || file.name));
      setImportWizardStep(2);
      setImportMessage(null);
      setError(null);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Unable to inspect the uploaded file.";
      appendImportConsoleEntry(`[inspect] ${file.name}: ${message}`);
      setError(message);
    } finally {
      event.target.value = "";
    }
  }

  function resetImportWizard(options?: { preserveMessage?: boolean }) {
    setImportWizardStep(1);
    setImportFile(null);
    setImportSheetName("");
    setImportMatrix([]);
    setImportColumnSpecs([]);
    setImportPreviewDataset(null);
    setImportConversionIssues([]);
    setImportLabel("");
    setImportTableName("");
    setImportToPersistent(false);
    setImportConsoleEntries([]);
    if (!options?.preserveMessage) {
      setImportMessage(null);
    }
  }

  function updateImportColumnType(columnKey: string, targetType: StudioImportColumnSpec["targetType"]) {
    setImportColumnSpecs((current) =>
      current.map((column) => (column.key === columnKey ? { ...column, targetType } : column))
    );
  }

  async function submitImportWizard() {
    if (!importFile) {
      const message = "Choose a CSV or Excel file first.";
      appendImportConsoleEntry(`[upload] ${message}`);
      setError(message);
      return;
    }

    setImportConsoleEntries([]);
    setUploading(true);
    setError(null);
    setImportMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", importFile);
      formData.append("importLabel", importLabel.trim() || importFile.name);
      formData.append("tableName", importTableName.trim() || sanitizeImportedTableName(importLabel.trim() || importFile.name));
      formData.append("importToPersistent", String(importToPersistent));
      formData.append(
        "columnTypes",
        JSON.stringify(importColumnSpecs.map((column) => ({ key: column.key, targetType: column.targetType })))
      );

      const response = await fetch("/api/explorer/data-studio/upload", {
        method: "POST",
        body: formData,
        credentials: "include"
      });
      const body = (await response.json().catch(() => null)) as { error?: string; dataset?: StudioDataset } | null;

      if (!response.ok || !body?.dataset) {
        throw new Error(
          body?.error ??
            `Upload failed with ${response.status} ${response.statusText || "Unknown status"}: missing dataset payload.`
        );
      }

      setWorkspaceDataset(body.dataset, "import-wizard");
      setImportMessage(
        body.dataset.metadata?.importedPermanently
          ? `File imported into table ${String(body.dataset.metadata?.temporaryTableName ?? importTableName)} and copied into persistent table ${String(body.dataset.metadata?.persistentTableName ?? importTableName)}.`
          : `File imported into temporary analysis table ${String(body.dataset.metadata?.temporaryTableName ?? importTableName)}.`
      );
      setImportConsoleEntries([]);
      resetImportWizard({ preserveMessage: true });
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Unable to load the uploaded file.";
      appendImportConsoleEntry(`[upload] ${importFile.name}: ${message}`);
      setError(message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="h-full overflow-auto bg-slate-950/10 p-2">
      <Card className={compactCardClassName}>
        <HoverSubtitleTitle
          subtitle="Import CSV, XLS, or XLSX files into the studio workspace and optionally the persistent import store."
          title="Data import wizard"
        />
        <div className="mt-2 flex gap-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">
          <span className={importWizardStep >= 1 ? "text-sky-300" : ""}>1. File</span>
          <span>/</span>
          <span className={importWizardStep >= 2 ? "text-sky-300" : ""}>2. Types</span>
          <span>/</span>
          <span className={importWizardStep >= 3 ? "text-sky-300" : ""}>3. Destination</span>
          <span>/</span>
          <span className={importWizardStep >= 4 ? "text-sky-300" : ""}>4. Import</span>
        </div>
        {importWizardStep === 1 ? (
          <div className="mt-3 space-y-2">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-none border border-dashed border-sky-400/35 bg-sky-400/8 px-3 py-3 text-xs text-sky-100">
              <FileUp className="h-3.5 w-3.5" />
              <span>Choose CSV or Excel file</span>
              <Input accept=".csv,.xls,.xlsx" className="hidden" onChange={handleUpload} type="file" />
            </label>
            <p className="text-[11px] text-slate-400">Supported formats: CSV, XLS, XLSX. Maximum size: 20 MB.</p>
          </div>
        ) : null}
        {importWizardStep === 2 && importFile ? (
          <div className="mt-3 space-y-2">
            <div className="grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="border border-white/10 bg-slate-950/25 p-3 text-[11px] text-slate-300">
                  <p className="font-medium text-white">{importFile.name}</p>
                  <p className="mt-1">{`${(importFile.size / (1024 * 1024)).toFixed(2)} MB · ${importSheetName}`}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    <Badge className={compactBadgeClassName}>{`${importColumnSpecs.length} columns`}</Badge>
                    <Badge className={compactBadgeClassName}>{`${previewRows.length} of ${importPreviewDataset?.rowCount ?? 0} sample rows`}</Badge>
                    <Badge className={compactBadgeClassName}>{`Table: ${importTableName || "auto"}`}</Badge>
                  </div>
                </div>
                <div className="space-y-2 border border-white/10 bg-slate-950/25 p-3">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Column types</p>
                  <p className="text-[11px] text-slate-400">
                    Adjust the data type directly in each column header while reviewing the first 40 imported rows.
                  </p>
                  <div className="max-h-72 space-y-2 overflow-auto pr-1">
                    {importColumnSpecs.map((column) => (
                      <div key={column.key} className="flex items-center justify-between gap-2 border border-white/10 bg-slate-950/35 px-2 py-1.5">
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-medium text-white">{column.label}</p>
                          <p className="text-[10px] text-slate-400">{`Detected as ${column.inferredType}`}</p>
                        </div>
                        <Badge className={compactBadgeClassName}>{column.targetType}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
                {importConversionIssues.length > 0 ? (
                  <div className="border border-amber-400/25 bg-amber-500/10 p-3 text-[11px] text-amber-100">
                    <p className="font-medium">Preview conversion notes</p>
                    <div className="mt-1 space-y-1">
                      {importConversionIssues.map((issue) => (
                        <p key={issue}>{issue}</p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="border border-emerald-400/20 bg-emerald-500/10 p-3 text-[11px] text-emerald-100">
                    Type conversion preview is clean for the current 40-row sample.
                  </div>
                )}
              </div>
              <div className="space-y-2 border border-white/10 bg-slate-950/25 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Sample preview</p>
                    <p className="text-[11px] text-slate-400">
                      First {previewSampleRowLimit} rows with per-column type selection in the header.
                    </p>
                  </div>
                </div>
                <ImportPreviewTable
                  columnSpecs={importColumnSpecs}
                  columns={previewColumns}
                  emptyMessage="The current type configuration did not produce preview rows."
                  onTypeChange={updateImportColumnType}
                  rows={previewRows}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button className={`flex-1 ${compactButtonClassName}`} onClick={() => resetImportWizard()} type="button" variant="ghost">
                Back
              </Button>
              <Button className={`flex-1 ${compactButtonClassName}`} onClick={() => setImportWizardStep(3)} type="button">
                Continue
              </Button>
            </div>
          </div>
        ) : null}
        {importWizardStep === 3 && importFile ? (
          <div className="mt-3 space-y-2">
            <Input
              className="rounded-none px-2 py-1 text-[11px]"
              onChange={(event) => setImportLabel(event.target.value)}
              placeholder="Dataset label"
              value={importLabel}
            />
            <div className="space-y-2 border border-white/10 bg-slate-950/25 px-2 py-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Database table name</p>
              <Input
                className="rounded-none px-2 py-1 text-[11px]"
                onChange={(event) => setImportTableName(sanitizeImportedTableName(event.target.value, importLabel || importFile.name))}
                placeholder="imported_data"
                value={importTableName}
              />
              <p className="text-[10px] text-slate-500">
                A new table with this name will be created in {importToPersistent ? "both storage schemas" : "the temporary analysis schema"}.
              </p>
            </div>
            <label className="flex items-start gap-2 border border-white/10 bg-slate-950/25 px-2 py-2 text-[11px] text-slate-300">
              <input
                checked={importToPersistent}
                className="mt-0.5 h-3.5 w-3.5 border-white/20 bg-slate-950/50"
                onChange={(event) => setImportToPersistent(event.target.checked)}
                type="checkbox"
              />
              <span>
                Copy this uploaded dataset into the persistent import store as well.
                <span className="mt-1 block text-[10px] text-slate-500">
                  Leave unchecked to keep the upload in temporary analysis storage only.
                </span>
              </span>
            </label>
            <div className="flex gap-2">
              <Button className={`flex-1 ${compactButtonClassName}`} onClick={() => setImportWizardStep(2)} type="button" variant="ghost">
                Back
              </Button>
              <Button className={`flex-1 ${compactButtonClassName}`} onClick={() => setImportWizardStep(4)} type="button">
                Continue
              </Button>
            </div>
          </div>
        ) : null}
        {importWizardStep === 4 && importFile ? (
          <div className="mt-3 space-y-2">
            <div className="border border-white/10 bg-slate-950/25 p-2 text-[11px] text-slate-300">
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Review</p>
              <p className="mt-2 text-white">{importLabel.trim() || importFile.name}</p>
              <p className="mt-1">{importFile.name}</p>
              <p className="mt-1">{`Table name: ${importTableName || sanitizeImportedTableName(importLabel.trim() || importFile.name)}`}</p>
              <p className="mt-1">{`${importColumnSpecs.length} columns with explicit target types`}</p>
              <p className="mt-1">{importToPersistent ? "Temporary analysis + persistent import copy" : "Temporary analysis only"}</p>
            </div>
            {importConversionIssues.length > 0 ? (
              <div className="border border-amber-400/25 bg-amber-500/10 p-2 text-[11px] text-amber-100">
                <p className="font-medium">Conversion notes</p>
                <div className="mt-1 space-y-1">
                  {importConversionIssues.map((issue) => (
                    <p key={issue}>{issue}</p>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button className={`flex-1 ${compactButtonClassName}`} onClick={() => setImportWizardStep(3)} type="button" variant="ghost">
                Back
              </Button>
              <Button className={`flex-1 ${compactButtonClassName}`} disabled={uploading} onClick={() => void submitImportWizard()} type="button">
                <FileUp className="mr-1 h-3.5 w-3.5" />
                {uploading ? "Importing…" : "Import file"}
              </Button>
            </div>
          </div>
        ) : null}
        {importMessage ? <p className="mt-3 text-[11px] text-emerald-300">{importMessage}</p> : null}
        {error ? <p className="mt-3 text-[11px] text-rose-300">{error}</p> : null}
        {importConsoleEntries.length > 0 ? (
          <div className="mt-3 border border-white/10 bg-slate-950/40 p-2">
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Wizard console</p>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-slate-300">
              {importConsoleEntries.join("\n")}
            </pre>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
