"use client";

import { DatabaseZap, Filter, Layers3, PanelLeftClose, PanelLeftOpen, RefreshCw, Sigma, Table2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  applyStudioFilters,
  buildStudioPivot,
  buildStudioSummary,
  type AccessibleStudioSource,
  type StudioAggregation,
  type StudioDataset,
  type StudioFilter
} from "@/lib/data-studio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HoverHelperLabel } from "@/components/ui/hover-helper-label";
import { HoverSubtitleTitle } from "@/components/ui/hover-subtitle-title";
import { Input } from "@/components/ui/input";
import { getSourceDataDictionaryPreview, hasSourceDataDictionary } from "@/lib/data-dictionary";
import { useStudioWorkspaceStore } from "@/lib/stores/studio-workspace";
import {
  fetchAccessibleStudioSources,
  getImportedDatasetMessage,
  loadWorkspaceDatasetFromSources
} from "@/lib/studio-workspace-loader";

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

type StudioWorkspacePanel = "summary" | "pivot";
type TableRow = Array<Record<string, string | number | boolean | null>>;
type PivotResult = {
  columns: string[];
  rows: TableRow;
};

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

  const numericColumns = new Set(
    columns.filter(
      (column) =>
        rows.some((row) => typeof row[column] === "number") &&
        rows.every((row) => row[column] === null || typeof row[column] === "number")
    )
  );

  function formatCellValue(value: string | number | boolean | null) {
    if (typeof value === "number") {
      return Number(value.toFixed(2)).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      });
    }

    if (value === null) {
      return null;
    }

    return String(value);
  }

  const numericColumnWidths = new Map(
    columns.map((column) => {
      if (!numericColumns.has(column)) {
        return [column, null] as const;
      }

      const longestValueLength = rows.reduce((maxLength, row) => {
        const formattedValue = formatCellValue(row[column]);
        return Math.max(maxLength, formattedValue?.length ?? 1);
      }, 1);

      return [column, Math.max(7, longestValueLength + 1)] as const;
    })
  );

  return (
    <div className="overflow-x-auto rounded-none border border-white/10">
      <table className="w-max min-w-full divide-y divide-white/10 text-[10px] leading-tight text-slate-200">
        <thead className="bg-white/5">
          <tr>
            {columns.map((column) => {
              const isNumericColumn = numericColumns.has(column);
              const numericColumnWidth = numericColumnWidths.get(column);

              return (
                <th
                  key={column}
                  className={`px-1 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400 ${
                    isNumericColumn ? "text-right" : "w-[88px] max-w-[88px] text-left"
                  }`}
                  style={
                    isNumericColumn && numericColumnWidth
                      ? {
                          width: `${numericColumnWidth}ch`,
                          minWidth: `${numericColumnWidth}ch`
                        }
                      : undefined
                  }
                >
                  <span
                    className={`block overflow-hidden ${
                      isNumericColumn ? "whitespace-nowrap" : "line-clamp-2 break-words text-balance"
                    }`}
                    title={column}
                  >
                    {column}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((row, index) => (
            <tr key={`${index}-${String(row[columns[0]] ?? "row")}`} className="bg-slate-950/20">
              {columns.map((column) => {
                const formattedValue = formatCellValue(row[column]);
                const isNumericColumn = numericColumns.has(column);
                const numericColumnWidth = numericColumnWidths.get(column);

                return (
                  <td
                    key={column}
                    className={`px-1 py-1 align-top text-slate-200 ${
                      isNumericColumn ? "text-right" : "w-[88px] max-w-[88px]"
                    }`}
                    style={
                      isNumericColumn && numericColumnWidth
                        ? {
                            width: `${numericColumnWidth}ch`,
                            minWidth: `${numericColumnWidth}ch`
                          }
                        : undefined
                    }
                  >
                    <span
                      className={`block overflow-hidden text-[10px] leading-tight ${
                        isNumericColumn ? "whitespace-nowrap font-mono tabular-nums" : "line-clamp-3 break-words"
                      }`}
                      title={formattedValue ?? ""}
                    >
                      {formattedValue === null ? <span className="text-slate-500">-</span> : formattedValue}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DataStudioWindow({
  onOpenImportWizard,
  onOpenDataDictionaryWindow
}: {
  onOpenImportWizard?: () => void;
  onOpenDataDictionaryWindow?: () => void;
}) {
  const setWorkspaceDataset = useStudioWorkspaceStore((state) => state.setDataset);
  const sharedDataset = useStudioWorkspaceStore((state) => state.dataset);
  const lastUpdatedBy = useStudioWorkspaceStore((state) => state.lastUpdatedBy);
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
  const [activePanel, setActivePanel] = useState<StudioWorkspacePanel>("summary");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loadingSources, setLoadingSources] = useState(true);
  const [refreshingSources, setRefreshingSources] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [summaryRows, setSummaryRows] = useState<TableRow>([]);
  const [summaryDirty, setSummaryDirty] = useState(false);
  const [pivotResult, setPivotResult] = useState<PivotResult>({ columns: [], rows: [] });
  const [pivotDirty, setPivotDirty] = useState(false);

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
    setActivePanel("summary");
    setSummaryRows([]);
    setPivotResult({ columns: [], rows: [] });
    setSummaryDirty(nextDataset.rows.length > 0);
    setPivotDirty(nextDataset.rows.length > 0);
  }, []);

  const loadSources = useCallback(async (initialLoad = false) => {
    if (initialLoad) {
      setLoadingSources(true);
    } else {
      setRefreshingSources(true);
    }

    setError(null);

    try {
      setSources(await fetchAccessibleStudioSources());
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

  useEffect(() => {
    if ((lastUpdatedBy === "transform-studio" || lastUpdatedBy === "import-wizard") && sharedDataset) {
      setDataset(sharedDataset);
      resetTransforms(sharedDataset);
      setError(null);
      setActivePanel("summary");
      setImportMessage(
        lastUpdatedBy === "import-wizard"
          ? getImportedDatasetMessage(sharedDataset)
          : null
      );
    }
  }, [lastUpdatedBy, resetTransforms, sharedDataset]);

  const columns = dataset?.columns ?? [];
  const numericColumns = columns.filter((column) => column.kind === "number");

  const filteredRows = useMemo(
    () => (dataset ? applyStudioFilters(dataset.rows, filters) : []),
    [dataset, filters]
  );

  useEffect(() => {
    if (!dataset) {
      setSummaryRows([]);
      setSummaryDirty(false);
      return;
    }

    setSummaryRows([]);
    setSummaryDirty(true);
  }, [dataset, filters, summaryConfig]);

  useEffect(() => {
    if (!dataset) {
      setPivotResult({ columns: [], rows: [] });
      setPivotDirty(false);
      return;
    }

    setPivotResult({ columns: [], rows: [] });
    setPivotDirty(true);
  }, [dataset, filters, pivotConfig]);

  async function loadSelectedSourcesDataset() {
    try {
      const result = await loadWorkspaceDatasetFromSources(sources, selectedSourceIds);
      setDataset(result.dataset);
      setWorkspaceDataset(result.dataset, "data-studio");
      resetTransforms(result.dataset);
      setImportMessage(result.message);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load the selected dataset.");
    }
  }

  function runSummary() {
    if (!dataset) {
      setError("Load a dataset to generate grouped summaries.");
      return;
    }

    setSummaryRows(
      buildStudioSummary(filteredRows, {
        groupBy: summaryConfig.groupBy || undefined,
        aggregation: summaryConfig.aggregation,
        metricColumn: summaryConfig.metricColumn || undefined
      })
    );
    setSummaryDirty(false);
    setError(null);
  }

  function runPivot() {
    if (!dataset) {
      setError("Load a dataset to generate a pivot table.");
      return;
    }

    setPivotResult(
      buildStudioPivot(filteredRows, {
        rowField: pivotConfig.rowField || undefined,
        columnField: pivotConfig.columnField || undefined,
        aggregation: pivotConfig.aggregation,
        valueField: pivotConfig.valueField || undefined
      })
    );
    setPivotDirty(false);
    setError(null);
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
                <HoverSubtitleTitle
                  subtitle="Choose governed sources or upload a spreadsheet to manipulate tabular data."
                  title="Data Studio"
                />
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
                <HoverSubtitleTitle
                  subtitle="Load governed data sources and persistent imported tables as a metadata dataset inside the studio."
                  title="Governed sources"
                />
              </div>
              <div className="flex items-center gap-2">
                {onOpenDataDictionaryWindow ? (
                  <Button className={compactButtonClassName} onClick={onOpenDataDictionaryWindow} type="button" variant="outline">
                    Data dictionaries
                  </Button>
                ) : null}
                <Button className={compactButtonClassName} onClick={() => void loadSources()} type="button" variant="ghost">
                  <RefreshCw className={`mr-2 h-4 w-4 ${refreshingSources ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>
            <div className="mt-2 space-y-2">
              {loadingSources ? (
                <p className="text-xs text-slate-400">Loading data sources…</p>
              ) : sources.length === 0 ? (
                <p className="rounded-none border border-dashed border-white/10 bg-slate-950/20 px-3 py-4 text-xs text-slate-400">
                  No governed data sources or persistent imported tables are available for this account yet.
                </p>
              ) : (
                <div className="max-h-64 space-y-1 overflow-auto pr-1">
                  {sources.map((source) => {
                    const checked = selectedSourceIds.includes(source.id);

                    return (
                      <label key={source.id} className="flex cursor-pointer items-start gap-2 border border-white/10 bg-slate-950/25 px-2 py-2">
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
                              {source.sourceKind === "persistent-import" ? (
                                <Table2 className="h-3.5 w-3.5 text-emerald-300" />
                              ) : (
                                <DatabaseZap className="h-3.5 w-3.5 text-sky-300" />
                              )}
                              <HoverHelperLabel
                                helper={
                                  <>
                                    <div>{`${source.type} · ${source.owner}`}</div>
                                    {source.tableName ? <div>{`Table: ${source.tableName}`}</div> : null}
                                    {source.rowCount !== null && source.columnCount !== null
                                      ? <div>{`${source.rowCount} rows · ${source.columnCount} columns`}</div>
                                      : null}
                                    <div>{source.description || "No description provided."}</div>
                                    <div>{hasSourceDataDictionary(source.dataDictionary) ? "Data dictionary available." : "No data dictionary defined yet."}</div>
                                  </>
                                }
                                label={source.name}
                                labelClassName="truncate text-xs font-medium text-white"
                                tooltipClassName="text-[10px]"
                                wrapperClassName="max-w-full"
                              />
                            </div>
                            {source.tableName ? (
                              <p className="mt-1 truncate text-[10px] text-slate-500">{source.tableName}</p>
                            ) : null}
                              <p className={`mt-1 text-[10px] ${hasSourceDataDictionary(source.dataDictionary) ? "text-emerald-300" : "text-slate-500"}`}>
                                {hasSourceDataDictionary(source.dataDictionary)
                                  ? `Dictionary: ${getSourceDataDictionaryPreview(source.dataDictionary).slice(0, 120)}${getSourceDataDictionaryPreview(source.dataDictionary).length > 120 ? "…" : ""}`
                                  : "No data dictionary defined."}
                              </p>
                            </div>
                        </label>
                    );
                  })}
                </div>
              )}
              <Button className={`w-full ${compactButtonClassName}`} onClick={() => void loadSelectedSourcesDataset()} type="button">
                <DatabaseZap className="mr-2 h-4 w-4" />
                Load selected sources
              </Button>
            </div>
            </Card>

            <Card className={compactCardClassName}>
              <div>
                <HoverSubtitleTitle
                  subtitle="Launch the guided floating window for CSV and Excel imports with type conversion."
                  title="Data import wizard"
                />
              </div>
              <div className="mt-2 space-y-2">
                <p className="text-[11px] text-slate-400">
                  Open the dedicated import window to choose a file, set column types, and optionally save a persistent copy.
                </p>
                <Button className={`w-full ${compactButtonClassName}`} onClick={onOpenImportWizard} type="button">
                  Open import window
                </Button>
                {importMessage ? <p className="text-[11px] text-emerald-300">{importMessage}</p> : null}
              </div>
            </Card>

            <Card className={compactCardClassName}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <HoverSubtitleTitle
                  subtitle="Apply column filters before pivoting or summarizing."
                  title="Filters"
                />
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
                  <p className="text-xs font-medium text-white">{summaryDirty ? "Pending run" : summaryRows.length}</p>
                </div>
              </div>
            </Card>
            <Card className={compactCardClassName}>
              <div className="flex items-center gap-3">
                <Layers3 className="h-4 w-4 text-violet-300" />
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Pivot columns</p>
                  <p className="text-xs font-medium text-white">{pivotDirty ? "Pending run" : pivotResult.columns.length}</p>
                </div>
              </div>
            </Card>
          </div>

          {error ? (
            <div className="border border-rose-400/25 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-100">
              {error}
            </div>
          ) : null}

          {activePanel === "summary" ? (
            <Card className={`${compactCardClassName} min-h-0`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <HoverSubtitleTitle
                    subtitle="Configure the aggregation, then click Run summary to execute it."
                    title="Summarization"
                  />
                </div>
                <Button className={compactButtonClassName} onClick={runSummary} type="button">
                  <Sigma className="mr-1 h-3.5 w-3.5" />
                  Run summary
                </Button>
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
                  emptyMessage={
                    !dataset
                      ? "Load a dataset to generate grouped summaries."
                      : summaryDirty
                        ? "Click Run summary to execute the current summary configuration."
                        : "The current summary returned no rows."
                  }
                  rows={summaryRows}
                />
              </div>
            </Card>
          ) : null}

          {activePanel === "pivot" ? (
            <Card className={`${compactCardClassName} min-h-0`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <HoverSubtitleTitle
                    subtitle="Choose the row and column fields, then click Run pivot to build the cross-tab."
                    title="Pivot table"
                  />
                </div>
                <Button className={compactButtonClassName} onClick={runPivot} type="button">
                  <Layers3 className="mr-1 h-3.5 w-3.5" />
                  Run pivot
                </Button>
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
                  emptyMessage={
                    !dataset
                      ? "Choose row and column fields to build a pivot table."
                      : pivotDirty
                        ? "Click Run pivot to execute the current pivot configuration."
                        : "The current pivot returned no rows."
                  }
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
