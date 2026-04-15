"use client";

import { DatabaseZap, FileUp, Filter, Layers3, PanelLeftClose, PanelLeftOpen, RefreshCw, Sigma, Table2 } from "lucide-react";
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  applyStudioFilters,
  buildSourceCatalogDataset,
  buildStudioPivot,
  buildStudioSummary,
  DATA_STUDIO_FILE_LIMIT_BYTES,
  type AccessibleStudioSource,
  type StudioAggregation,
  type StudioDataset,
  type StudioFilter
} from "@/lib/data-studio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type SummaryConfig = {
  groupBy: string;
  aggregation: StudioAggregation;
  metricColumn: string;
};

type PivotConfig = {
  rowField: string;
  columnField: string;
  aggregation: StudioAggregation;
  valueField: string;
};

type StudioWorkspacePanel = "preview" | "summary" | "pivot";

const selectClassName =
  "w-full rounded-none border border-white/10 bg-slate-950/50 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-400";
const compactCardClassName = "rounded-none p-3";
const compactButtonClassName = "h-auto rounded-none px-2 py-1 text-[11px]";
const compactBadgeClassName = "rounded-none px-1.5 py-0.5 text-[10px]";

function createEmptyFilter(): StudioFilter {
  return {
    id: Math.random().toString(36).slice(2),
    column: "",
    operator: "contains",
    value: ""
  };
}

function DataTable({
  rows,
  columns,
  emptyMessage
}: {
  rows: Array<Record<string, string | number | boolean | null>>;
  columns: string[];
  emptyMessage: string;
}) {
  if (rows.length === 0 || columns.length === 0) {
    return (
      <div className="rounded-none border border-dashed border-white/10 bg-slate-950/20 px-3 py-6 text-center text-xs text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-none border border-white/10">
      <table className="min-w-max w-full table-fixed divide-y divide-white/10 text-[11px] leading-tight text-slate-200">
        <thead className="bg-white/5">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                <span className="block max-w-[96px] truncate" title={column}>
                  {column}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((row, index) => (
            <tr key={`${index}-${String(row[columns[0]] ?? "row")}`} className="bg-slate-950/20">
              {columns.map((column) => (
                <td key={column} className="px-1.5 py-1 align-top text-slate-200">
                  <span className="block max-w-[96px] truncate" title={row[column] === null ? "" : String(row[column])}>
                    {row[column] === null ? <span className="text-slate-500">-</span> : String(row[column])}
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

export function DataStudioWindow() {
  const [sources, setSources] = useState<AccessibleStudioSource[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [dataset, setDataset] = useState<StudioDataset | null>(null);
  const [filters, setFilters] = useState<StudioFilter[]>([]);
  const [summaryConfig, setSummaryConfig] = useState<SummaryConfig>({
    groupBy: "",
    aggregation: "count",
    metricColumn: ""
  });
  const [pivotConfig, setPivotConfig] = useState<PivotConfig>({
    rowField: "",
    columnField: "",
    aggregation: "count",
    valueField: ""
  });
  const [activePanel, setActivePanel] = useState<StudioWorkspacePanel>("preview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loadingSources, setLoadingSources] = useState(true);
  const [refreshingSources, setRefreshingSources] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetTransforms = useCallback((nextDataset: StudioDataset) => {
    const firstColumn = nextDataset.columns[0]?.key ?? "";
    const secondColumn = nextDataset.columns[1]?.key ?? firstColumn;
    const firstNumericColumn = nextDataset.columns.find((column) => column.kind === "number")?.key ?? "";

    setFilters([]);
    setSummaryConfig({
      groupBy: firstColumn,
      aggregation: "count",
      metricColumn: firstNumericColumn
    });
    setPivotConfig({
      rowField: firstColumn,
      columnField: secondColumn,
      aggregation: "count",
      valueField: firstNumericColumn
    });
    setActivePanel("preview");
  }, []);

  const loadSources = useCallback(async (initialLoad = false) => {
    if (initialLoad) {
      setLoadingSources(true);
    } else {
      setRefreshingSources(true);
    }

    setError(null);

    try {
      const response = await fetch("/api/explorer/data-studio", {
        method: "GET",
        credentials: "include"
      });
      const body = (await response.json().catch(() => null)) as { error?: string; sources?: AccessibleStudioSource[] } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to load governed data sources.");
      }

      setSources(body?.sources ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load governed data sources.");
    } finally {
      setLoadingSources(false);
      setRefreshingSources(false);
    }
  }, []);

  useEffect(() => {
    void loadSources(true);
  }, [loadSources]);

  const columns = dataset?.columns ?? [];
  const numericColumns = columns.filter((column) => column.kind === "number");

  const filteredRows = useMemo(
    () => (dataset ? applyStudioFilters(dataset.rows, filters) : []),
    [dataset, filters]
  );

  const summaryRows = useMemo(
    () =>
      activePanel === "summary" && dataset
        ? buildStudioSummary(filteredRows, {
            groupBy: summaryConfig.groupBy || undefined,
            aggregation: summaryConfig.aggregation,
            metricColumn: summaryConfig.metricColumn || undefined
          })
        : [],
    [activePanel, dataset, filteredRows, summaryConfig]
  );

  const pivotResult = useMemo(
    () =>
      activePanel === "pivot" && dataset
        ? buildStudioPivot(filteredRows, {
            rowField: pivotConfig.rowField || undefined,
            columnField: pivotConfig.columnField || undefined,
            aggregation: pivotConfig.aggregation,
            valueField: pivotConfig.valueField || undefined
          })
        : { columns: [], rows: [] },
    [activePanel, dataset, filteredRows, pivotConfig]
  );

  function loadSelectedSourcesDataset() {
    const scopedSources =
      selectedSourceIds.length > 0
        ? sources.filter((source) => selectedSourceIds.includes(source.id))
        : sources;

    if (scopedSources.length === 0) {
      setError("Select at least one data source or upload a file.");
      return;
    }

    const nextDataset = buildSourceCatalogDataset(scopedSources, scopedSources.length === 1 ? scopedSources[0].name : "Selected governed data sources");
    setDataset(nextDataset);
    resetTransforms(nextDataset);
    setError(null);
    setSidebarOpen(false);
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.size > DATA_STUDIO_FILE_LIMIT_BYTES) {
      setError("Files larger than 20 MB are not allowed.");
      event.target.value = "";
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/explorer/data-studio/upload", {
        method: "POST",
        body: formData,
        credentials: "include"
      });
      const body = (await response.json().catch(() => null)) as { error?: string; dataset?: StudioDataset } | null;

      if (!response.ok || !body?.dataset) {
        throw new Error(body?.error ?? "Unable to load the uploaded file.");
      }

      setDataset(body.dataset);
      resetTransforms(body.dataset);
      setSidebarOpen(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load the uploaded file.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  return (
    <div className="h-full overflow-hidden bg-slate-950/10 p-2">
      <div className="flex h-full gap-2">
        {sidebarOpen ? (
          <div className="w-[250px] shrink-0 space-y-2 overflow-auto border-r border-white/10 pr-2">
            <div className="flex items-center justify-between border border-white/10 bg-slate-950/35 px-2 py-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Navigation</p>
              <Button className={compactButtonClassName} onClick={() => setSidebarOpen(false)} type="button" variant="ghost">
                <PanelLeftClose className="mr-1 h-3.5 w-3.5" />
                Hide
              </Button>
            </div>
            <Card className={compactCardClassName}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Data Studio</CardTitle>
                <CardDescription>Choose governed sources or upload a spreadsheet to manipulate tabular data.</CardDescription>
              </div>
              <Badge className={compactBadgeClassName}>{dataset?.sourceKind === "upload" ? "Upload" : "Studio"}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-300">
              <Badge className={`${compactBadgeClassName} bg-sky-400/15 text-sky-100`}>20 MB max</Badge>
              <Badge className={compactBadgeClassName}>{dataset?.rowCount ?? 0} rows</Badge>
              <Badge className={compactBadgeClassName}>{columns.length} columns</Badge>
            </div>
            </Card>

            <Card className={compactCardClassName}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Governed sources</CardTitle>
                <CardDescription>Load accessible data sources as a metadata dataset inside the studio.</CardDescription>
              </div>
              <Button className={compactButtonClassName} onClick={() => void loadSources()} type="button" variant="ghost">
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshingSources ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {loadingSources ? (
                <p className="text-xs text-slate-400">Loading data sources…</p>
              ) : sources.length === 0 ? (
                <p className="rounded-none border border-dashed border-white/10 bg-slate-950/20 px-3 py-4 text-xs text-slate-400">
                  No governed data sources are available for this account yet.
                </p>
              ) : (
                <div className="max-h-64 space-y-1 overflow-auto pr-1">
                  {sources.map((source) => {
                    const checked = selectedSourceIds.includes(source.id);

                    return (
                      <label
                        key={source.id}
                        className="flex cursor-pointer items-start gap-2 border border-white/10 bg-slate-950/25 px-2 py-2"
                      >
                        <input
                          checked={checked}
                          className="mt-0.5 h-3.5 w-3.5 border-white/20 bg-slate-950/50"
                          onChange={(event) =>
                            setSelectedSourceIds((current) =>
                              event.target.checked
                                ? [...current, source.id]
                                : current.filter((sourceId) => sourceId !== source.id)
                            )
                          }
                          type="checkbox"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <DatabaseZap className="h-3.5 w-3.5 text-sky-300" />
                            <p className="truncate text-xs font-medium text-white">{source.name}</p>
                          </div>
                          <p className="mt-0.5 text-[10px] text-slate-400">{source.type} · {source.owner}</p>
                          <p className="mt-0.5 text-[10px] text-slate-500">{source.description || "No description provided."}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              <Button className={`w-full ${compactButtonClassName}`} onClick={loadSelectedSourcesDataset} type="button">
                <DatabaseZap className="mr-2 h-4 w-4" />
                Load selected sources
              </Button>
            </div>
            </Card>

            <Card className={compactCardClassName}>
            <div>
              <CardTitle>Upload file</CardTitle>
              <CardDescription>Import CSV, XLS, or XLSX files up to 20 MB.</CardDescription>
            </div>
            <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-none border border-dashed border-sky-400/35 bg-sky-400/8 px-3 py-3 text-xs text-sky-100">
              <FileUp className="h-3.5 w-3.5" />
              <span>{uploading ? "Uploading…" : "Choose CSV or Excel file"}</span>
              <Input accept=".csv,.xls,.xlsx" className="hidden" onChange={handleUpload} type="file" />
            </label>
            </Card>

            <Card className={compactCardClassName}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Filters</CardTitle>
                <CardDescription>Apply column filters before pivoting or summarizing.</CardDescription>
              </div>
              <Button
                className={compactButtonClassName}
                onClick={() => setFilters((current) => [...current, createEmptyFilter()])}
                type="button"
                variant="outline"
              >
                <Filter className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {filters.length === 0 ? (
                <p className="text-xs text-slate-400">No filters active.</p>
              ) : (
                filters.map((filter) => (
                  <div key={filter.id} className="space-y-2 border border-white/10 bg-slate-950/25 p-2">
                    <select
                      className={selectClassName}
                      onChange={(event) =>
                        setFilters((current) =>
                          current.map((entry) => (entry.id === filter.id ? { ...entry, column: event.target.value } : entry))
                        )
                      }
                      value={filter.column}
                    >
                      <option value="">Select column</option>
                      {columns.map((column) => (
                        <option key={column.key} value={column.key}>
                          {column.label}
                        </option>
                      ))}
                    </select>
                    <div className="grid gap-2 md:grid-cols-[170px_minmax(0,1fr)]">
                      <select
                        className={selectClassName}
                        onChange={(event) =>
                          setFilters((current) =>
                            current.map((entry) =>
                              entry.id === filter.id
                                ? { ...entry, operator: event.target.value as StudioFilter["operator"] }
                                : entry
                            )
                          )
                        }
                        value={filter.operator}
                      >
                        <option value="contains">contains</option>
                        <option value="equals">equals</option>
                        <option value="gt">greater than</option>
                        <option value="lt">less than</option>
                        <option value="is-empty">is empty</option>
                      </select>
                      <Input
                        className="rounded-none px-2 py-1 text-[11px]"
                        disabled={filter.operator === "is-empty"}
                        onChange={(event) =>
                          setFilters((current) =>
                            current.map((entry) => (entry.id === filter.id ? { ...entry, value: event.target.value } : entry))
                          )
                        }
                        placeholder="Filter value"
                        value={filter.value}
                      />
                    </div>
                    <Button
                      className={`w-full ${compactButtonClassName}`}
                      onClick={() => setFilters((current) => current.filter((entry) => entry.id !== filter.id))}
                      type="button"
                      variant="ghost"
                    >
                      Remove filter
                    </Button>
                  </div>
                ))
              )}
            </div>
            </Card>
          </div>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-auto">
          <div className="flex flex-wrap items-center gap-2 border border-white/10 bg-slate-950/35 px-2 py-1.5">
            <Button
              className={compactButtonClassName}
              onClick={() => setSidebarOpen((current) => !current)}
              type="button"
              variant="outline"
            >
              {sidebarOpen ? <PanelLeftClose className="mr-1 h-3.5 w-3.5" /> : <PanelLeftOpen className="mr-1 h-3.5 w-3.5" />}
              {sidebarOpen ? "Hide navigation" : "Show navigation"}
            </Button>
            <div className="ml-auto flex flex-wrap gap-1">
              <Button
                className={compactButtonClassName}
                onClick={() => setActivePanel("preview")}
                type="button"
                variant={activePanel === "preview" ? "default" : "outline"}
              >
                <Table2 className="mr-1 h-3.5 w-3.5" />
                Preview
              </Button>
              <Button
                className={compactButtonClassName}
                onClick={() => setActivePanel("summary")}
                type="button"
                variant={activePanel === "summary" ? "default" : "outline"}
              >
                <Sigma className="mr-1 h-3.5 w-3.5" />
                Summary
              </Button>
              <Button
                className={compactButtonClassName}
                onClick={() => setActivePanel("pivot")}
                type="button"
                variant={activePanel === "pivot" ? "default" : "outline"}
              >
                <Layers3 className="mr-1 h-3.5 w-3.5" />
                Pivot
              </Button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-4">
            <Card className={compactCardClassName}>
              <div className="flex items-center gap-3">
                <Table2 className="h-4 w-4 text-sky-300" />
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Dataset</p>
                  <p className="text-xs font-medium text-white">{dataset?.label ?? "No dataset loaded"}</p>
                </div>
              </div>
            </Card>
            <Card className={compactCardClassName}>
              <div className="flex items-center gap-3">
                <Filter className="h-4 w-4 text-emerald-300" />
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Filtered rows</p>
                  <p className="text-xs font-medium text-white">{filteredRows.length}</p>
                </div>
              </div>
            </Card>
            <Card className={compactCardClassName}>
              <div className="flex items-center gap-3">
                <Sigma className="h-4 w-4 text-amber-300" />
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Summary groups</p>
                  <p className="text-xs font-medium text-white">{activePanel === "summary" ? summaryRows.length : "Standby"}</p>
                </div>
              </div>
            </Card>
            <Card className={compactCardClassName}>
              <div className="flex items-center gap-3">
                <Layers3 className="h-4 w-4 text-violet-300" />
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Pivot columns</p>
                  <p className="text-xs font-medium text-white">{activePanel === "pivot" ? pivotResult.columns.length : "Standby"}</p>
                </div>
              </div>
            </Card>
          </div>

          {error ? (
            <div className="border border-rose-400/25 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-100">
              {error}
            </div>
          ) : null}

          {activePanel === "preview" ? (
            <Card className={`${compactCardClassName} min-h-0`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>Filtered data preview</CardTitle>
                  <CardDescription>The preview updates immediately as filters change.</CardDescription>
                </div>
                <div className="text-right text-[10px] text-slate-400">
                  <p>{dataset?.rowCount ?? 0} total rows</p>
                  <p>Showing up to 50 rows</p>
                </div>
              </div>
              <div className="mt-2">
                <DataTable
                  columns={columns.map((column) => column.key)}
                  emptyMessage="Load a governed source catalog or upload a file to start analyzing data."
                  rows={filteredRows.slice(0, 50)}
                />
              </div>
            </Card>
          ) : null}

          {activePanel === "summary" ? (
            <Card className={`${compactCardClassName} min-h-0`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>Summarization</CardTitle>
                  <CardDescription>Group rows and calculate counts or numeric aggregates.</CardDescription>
                </div>
                <Sigma className="h-4 w-4 text-amber-300" />
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <select
                  className={selectClassName}
                  onChange={(event) => setSummaryConfig((current) => ({ ...current, groupBy: event.target.value }))}
                  value={summaryConfig.groupBy}
                >
                  <option value="">No grouping</option>
                  {columns.map((column) => (
                    <option key={column.key} value={column.key}>
                      {column.label}
                    </option>
                  ))}
                </select>
                <select
                  className={selectClassName}
                  onChange={(event) =>
                    setSummaryConfig((current) => ({
                      ...current,
                      aggregation: event.target.value as StudioAggregation
                    }))
                  }
                  value={summaryConfig.aggregation}
                >
                  <option value="count">Count</option>
                  <option value="sum">Sum</option>
                  <option value="avg">Average</option>
                  <option value="min">Minimum</option>
                  <option value="max">Maximum</option>
                </select>
                <select
                  className={selectClassName}
                  disabled={summaryConfig.aggregation === "count"}
                  onChange={(event) => setSummaryConfig((current) => ({ ...current, metricColumn: event.target.value }))}
                  value={summaryConfig.metricColumn}
                >
                  <option value="">Metric column</option>
                  {numericColumns.map((column) => (
                    <option key={column.key} value={column.key}>
                      {column.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2">
                <DataTable
                  columns={summaryRows.length > 0 ? Object.keys(summaryRows[0]) : []}
                  emptyMessage="Load a dataset to generate grouped summaries."
                  rows={summaryRows}
                />
              </div>
            </Card>
          ) : null}

          {activePanel === "pivot" ? (
            <Card className={`${compactCardClassName} min-h-0`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>Pivot table</CardTitle>
                  <CardDescription>Cross-tab filtered rows by row and column dimensions.</CardDescription>
                </div>
                <Layers3 className="h-4 w-4 text-violet-300" />
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <select
                  className={selectClassName}
                  onChange={(event) => setPivotConfig((current) => ({ ...current, rowField: event.target.value }))}
                  value={pivotConfig.rowField}
                >
                  <option value="">Row field</option>
                  {columns.map((column) => (
                    <option key={column.key} value={column.key}>
                      {column.label}
                    </option>
                  ))}
                </select>
                <select
                  className={selectClassName}
                  onChange={(event) => setPivotConfig((current) => ({ ...current, columnField: event.target.value }))}
                  value={pivotConfig.columnField}
                >
                  <option value="">Column field</option>
                  {columns.map((column) => (
                    <option key={column.key} value={column.key}>
                      {column.label}
                    </option>
                  ))}
                </select>
                <select
                  className={selectClassName}
                  onChange={(event) =>
                    setPivotConfig((current) => ({
                      ...current,
                      aggregation: event.target.value as StudioAggregation
                    }))
                  }
                  value={pivotConfig.aggregation}
                >
                  <option value="count">Count</option>
                  <option value="sum">Sum</option>
                  <option value="avg">Average</option>
                  <option value="min">Minimum</option>
                  <option value="max">Maximum</option>
                </select>
                <select
                  className={selectClassName}
                  disabled={pivotConfig.aggregation === "count"}
                  onChange={(event) => setPivotConfig((current) => ({ ...current, valueField: event.target.value }))}
                  value={pivotConfig.valueField}
                >
                  <option value="">Value column</option>
                  {numericColumns.map((column) => (
                    <option key={column.key} value={column.key}>
                      {column.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2">
                <DataTable
                  columns={pivotResult.columns}
                  emptyMessage="Choose row and column fields to build a pivot table."
                  rows={pivotResult.rows}
                />
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
