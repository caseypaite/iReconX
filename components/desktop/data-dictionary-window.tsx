"use client";

import { BookText, DatabaseZap, RefreshCw, Save, Search, Table2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HoverSubtitleTitle } from "@/components/ui/hover-subtitle-title";
import { Input } from "@/components/ui/input";
import {
  getSourceDataDictionaryPreview,
  hasSourceDataDictionary,
  serializeSourceDataDictionary,
  type SourceDataDictionaryRecord
} from "@/lib/data-dictionary";
import type { AccessibleStudioSource } from "@/lib/data-studio";
import {
  fetchAccessibleStudioSources,
  fetchStudioSourceDictionaryDetail,
  updateStudioSourceDictionary,
  type StudioSourceDictionaryDetail
} from "@/lib/studio-workspace-loader";

const compactCardClassName = "rounded-none p-3";
const compactButtonClassName = "h-auto rounded-none px-2 py-1 text-[11px]";
const compactBadgeClassName = "rounded-none px-1.5 py-0.5 text-[10px]";

type SourceDictionaryDraft = {
  summary: string;
  columns: Record<string, string>;
};

function getColumnDraftKey(schema: string, table: string, column: string) {
  return [schema, table, column].join(".");
}

function buildDraftFromDetail(detail: StudioSourceDictionaryDetail): SourceDictionaryDraft {
  return {
    summary: detail.summary,
    columns: Object.fromEntries(
      detail.tables.flatMap((table) =>
        table.columns.map((column) => [
          getColumnDraftKey(table.schema, table.name, column.name),
          column.meaning
        ])
      )
    )
  };
}

export function DataDictionaryWindow() {
  const [sources, setSources] = useState<AccessibleStudioSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [detailBySourceId, setDetailBySourceId] = useState<Record<string, StudioSourceDictionaryDetail>>({});
  const [draftBySourceId, setDraftBySourceId] = useState<Record<string, SourceDictionaryDraft>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadSources = useCallback(async (initialLoad = false) => {
    if (initialLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setError(null);

    try {
      const nextSources = await fetchAccessibleStudioSources();
      setSources(nextSources);
      setSelectedSourceId((current) => {
        if (current && nextSources.some((source) => source.id === current)) {
          return current;
        }

        return nextSources[0]?.id ?? "";
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load data sources.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadSources(true);
  }, [loadSources]);

  const filteredSources = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return sources;
    }

    return sources.filter((source) =>
      [source.name, source.tableName, source.owner, source.description, source.type].some((value) =>
        value.toLowerCase().includes(query)
      )
    );
  }, [search, sources]);

  const selectedSource =
    filteredSources.find((source) => source.id === selectedSourceId) ??
    sources.find((source) => source.id === selectedSourceId) ??
    filteredSources[0] ??
    null;

  useEffect(() => {
    if (!selectedSource || detailBySourceId[selectedSource.id]) {
      return;
    }

    let cancelled = false;

    async function loadDetail() {
      try {
        setLoadingDetail(true);
        setError(null);

        const detail = await fetchStudioSourceDictionaryDetail(selectedSource.id);

        if (cancelled) {
          return;
        }

        setDetailBySourceId((current) => ({
          ...current,
          [selectedSource.id]: detail
        }));
        setDraftBySourceId((current) => ({
          ...current,
          [selectedSource.id]: current[selectedSource.id] ?? buildDraftFromDetail(detail)
        }));
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to load source columns.");
        }
      } finally {
        if (!cancelled) {
          setLoadingDetail(false);
        }
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [detailBySourceId, selectedSource]);

  const selectedDetail = selectedSource ? detailBySourceId[selectedSource.id] ?? null : null;
  const selectedDraft =
    selectedSource && selectedDetail
      ? draftBySourceId[selectedSource.id] ?? buildDraftFromDetail(selectedDetail)
      : null;

  async function saveSelectedSourceDictionary() {
    if (!selectedSource || !selectedDetail || !selectedDraft) {
      return;
    }

    try {
      setSaving(true);
      setMessage(null);
      setError(null);

      const nextRecord: SourceDataDictionaryRecord = {
        version: 1,
        summary: selectedDraft.summary,
        columns: selectedDetail.tables.flatMap((table) =>
          table.columns.map((column) => ({
            schema: table.schema,
            table: table.name,
            name: column.name,
            meaning: selectedDraft.columns[getColumnDraftKey(table.schema, table.name, column.name)] ?? ""
          }))
        )
      };
      const nextDictionary = serializeSourceDataDictionary(nextRecord);

      await updateStudioSourceDictionary(selectedSource, nextDictionary);

      setSources((current) =>
        current.map((source) => (source.id === selectedSource.id ? { ...source, dataDictionary: nextDictionary } : source))
      );
      setDetailBySourceId((current) => ({
        ...current,
        [selectedSource.id]: {
          ...selectedDetail,
          summary: selectedDraft.summary,
          tables: selectedDetail.tables.map((table) => ({
            ...table,
            columns: table.columns.map((column) => ({
              ...column,
              meaning: selectedDraft.columns[getColumnDraftKey(table.schema, table.name, column.name)] ?? ""
            }))
          }))
        }
      }));
      setMessage(`Saved data dictionary for ${selectedSource.name}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to save the data dictionary.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-hidden bg-slate-950/10 p-2">
      <div className="grid h-full min-h-0 gap-2 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className={`${compactCardClassName} min-h-0 overflow-hidden`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <HoverSubtitleTitle
                subtitle="Manage source-level dictionaries with separate meanings for each discovered column."
                title="Data dictionaries"
              />
            </div>
            <Button className={compactButtonClassName} onClick={() => void loadSources()} type="button" variant="ghost">
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-300">
            <Badge className={compactBadgeClassName}>{sources.length} sources</Badge>
            <Badge className={`${compactBadgeClassName} bg-emerald-400/15 text-emerald-100`}>
              {sources.filter((source) => hasSourceDataDictionary(source.dataDictionary)).length} with dictionaries
            </Badge>
          </div>
          <div className="mt-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <Input
                className="rounded-none border-white/10 bg-slate-950/50 pl-7 text-[11px]"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search sources"
                value={search}
              />
            </div>
          </div>
          <div className="mt-2 max-h-[calc(100vh-240px)] space-y-1 overflow-auto pr-1">
            {loading ? (
              <p className="text-xs text-slate-400">Loading data sources...</p>
            ) : filteredSources.length === 0 ? (
              <p className="rounded-none border border-dashed border-white/10 bg-slate-950/20 px-3 py-4 text-xs text-slate-400">
                No sources match the current search.
              </p>
            ) : (
              filteredSources.map((source) => {
                const isSelected = selectedSource?.id === source.id;
                const preview = getSourceDataDictionaryPreview(source.dataDictionary);

                return (
                  <button
                    key={source.id}
                    className={`w-full border px-2 py-2 text-left ${
                      isSelected ? "border-sky-400/50 bg-sky-500/10" : "border-white/10 bg-slate-950/25"
                    }`}
                    onClick={() => {
                      setSelectedSourceId(source.id);
                      setMessage(null);
                    }}
                    type="button"
                  >
                    <div className="flex items-center gap-2">
                      {source.sourceKind === "persistent-import" ? (
                        <Table2 className="h-3.5 w-3.5 text-emerald-300" />
                      ) : (
                        <DatabaseZap className="h-3.5 w-3.5 text-sky-300" />
                      )}
                      <span className="truncate text-xs font-medium text-white">{source.name}</span>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-slate-500">
                      {source.tableName || `${source.type} · ${source.owner}`}
                    </p>
                    <p className={`mt-1 text-[10px] ${hasSourceDataDictionary(source.dataDictionary) ? "text-emerald-300" : "text-slate-500"}`}>
                      {hasSourceDataDictionary(source.dataDictionary)
                        ? `${preview.slice(0, 96)}${preview.length > 96 ? "..." : ""}`
                        : "No dictionary defined"}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        <Card className={`${compactCardClassName} min-h-0 overflow-hidden`}>
          {!selectedSource ? (
            <div className="flex h-full items-center justify-center border border-dashed border-white/10 bg-slate-950/20 px-4 text-center text-sm text-slate-400">
              Select a data source to manage its dictionary.
            </div>
          ) : loadingDetail && !selectedDetail ? (
            <div className="flex h-full items-center justify-center border border-dashed border-white/10 bg-slate-950/20 px-4 text-center text-sm text-slate-400">
              Loading source columns...
            </div>
          ) : !selectedDetail || !selectedDraft ? (
            <div className="flex h-full items-center justify-center border border-dashed border-white/10 bg-slate-950/20 px-4 text-center text-sm text-slate-400">
              No column metadata is available for this source.
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-white">
                    <BookText className="h-4 w-4 text-sky-300" />
                    <span className="truncate">{selectedSource.name}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {selectedSource.sourceKind === "persistent-import"
                      ? `Persistent import${selectedSource.tableName ? ` · ${selectedSource.tableName}` : ""}`
                      : `${selectedSource.type} governed source · ${selectedSource.owner}`}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {selectedSource.description || "No description provided."}
                  </p>
                </div>
                <Badge className={compactBadgeClassName}>
                  {selectedSource.canEditDataDictionary ? "Editable" : "Read only"}
                </Badge>
              </div>

              <div className="mt-3 space-y-2">
                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Source overview</p>
                <textarea
                  className="min-h-[88px] w-full rounded-none border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400"
                  onChange={(event) =>
                    setDraftBySourceId((current) => ({
                      ...current,
                      [selectedSource.id]: {
                        ...(current[selectedSource.id] ?? selectedDraft),
                        summary: event.target.value
                      }
                    }))
                  }
                  placeholder="Describe what this source represents, business context, units, and any overall caveats."
                  readOnly={!selectedSource.canEditDataDictionary}
                  value={selectedDraft.summary}
                />
              </div>

              <div className="mt-3 min-h-0 flex-1 overflow-auto border border-white/10 bg-slate-950/20 p-3">
                <div className="space-y-4">
                  {selectedDetail.tables.map((table) => (
                    <div key={`${table.schema}.${table.name}`} className="space-y-2 border border-white/10 bg-slate-950/35 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium text-white">{table.name}</p>
                          <p className="text-[10px] text-slate-500">{table.schema}</p>
                        </div>
                        <Badge className={compactBadgeClassName}>{table.columns.length} columns</Badge>
                      </div>
                      <div className="space-y-2">
                        {table.columns.map((column) => {
                          const draftKey = getColumnDraftKey(table.schema, table.name, column.name);

                          return (
                            <div key={draftKey} className="grid gap-2 border border-white/10 bg-slate-950/30 p-2 md:grid-cols-[220px_minmax(0,1fr)]">
                              <div>
                                <p className="text-xs font-medium text-white">{column.name}</p>
                                <p className="mt-1 text-[10px] text-slate-500">
                                  {column.dataType}
                                  {column.isNullable ? " · nullable" : " · required"}
                                </p>
                              </div>
                              <Input
                                className="rounded-none border-white/10 bg-slate-950/50 text-[11px]"
                                onChange={(event) =>
                                  setDraftBySourceId((current) => ({
                                    ...current,
                                    [selectedSource.id]: {
                                      ...(current[selectedSource.id] ?? selectedDraft),
                                      columns: {
                                        ...(current[selectedSource.id]?.columns ?? selectedDraft.columns),
                                        [draftKey]: event.target.value
                                      }
                                    }
                                  }))
                                }
                                placeholder={`What does ${column.name} mean?`}
                                readOnly={!selectedSource.canEditDataDictionary}
                                value={selectedDraft.columns[draftKey] ?? ""}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500">
                  Tidyverse AI uses these saved column meanings with the forwarded schema from tidyverse-entry.
                </p>
                {selectedSource.canEditDataDictionary ? (
                  <Button className={compactButtonClassName} disabled={saving} onClick={() => void saveSelectedSourceDictionary()} type="button">
                    <Save className="mr-1 h-3.5 w-3.5" />
                    {saving ? "Saving..." : "Save dictionary"}
                  </Button>
                ) : null}
              </div>
            </div>
          )}
          {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
          {message ? <p className="mt-2 text-xs text-emerald-300">{message}</p> : null}
        </Card>
      </div>
    </div>
  );
}
