"use client";

import { useEffect, useMemo, useState } from "react";

import type { StudioDataset } from "@/lib/data-studio";
import type { PluginExecutionResult } from "@/lib/plugins/protocol";

export type ViewerNode =
  | {
      key: string;
      label: string;
      kind: "table";
      dataset: StudioDataset;
    }
  | {
      key: string;
      label: string;
      kind: "list";
      items: ViewerNode[];
    }
  | {
      key: string;
      label: string;
      kind: "scalar";
      value: string | number | boolean | null;
    }
  | {
      key: string;
      label: string;
      kind: "null";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStudioDataset(value: unknown): value is StudioDataset {
  return (
    isRecord(value) &&
    typeof value.label === "string" &&
    Array.isArray(value.columns) &&
    Array.isArray(value.rows) &&
    typeof value.rowCount === "number"
  );
}

function parseViewerNode(value: unknown): ViewerNode | null {
  if (!isRecord(value) || typeof value.key !== "string" || typeof value.label !== "string" || typeof value.kind !== "string") {
    return null;
  }

  if (value.kind === "table" && isStudioDataset(value.dataset)) {
    return {
      key: value.key,
      label: value.label,
      kind: "table",
      dataset: value.dataset
    };
  }

  if (value.kind === "list" && Array.isArray(value.items)) {
    const items = value.items.map((item) => parseViewerNode(item)).filter((item): item is ViewerNode => Boolean(item));
    return {
      key: value.key,
      label: value.label,
      kind: "list",
      items
    };
  }

  if (value.kind === "scalar") {
    const scalarValue =
      value.value === null || typeof value.value === "string" || typeof value.value === "number" || typeof value.value === "boolean"
        ? value.value
        : String(value.value);

    return {
      key: value.key,
      label: value.label,
      kind: "scalar",
      value: scalarValue
    };
  }

  if (value.kind === "null") {
    return {
      key: value.key,
      label: value.label,
      kind: "null"
    };
  }

  return null;
}

function inferViewerNode(key: string, label: string, value: unknown): ViewerNode {
  if (isStudioDataset(value)) {
    return {
      key,
      label,
      kind: "table",
      dataset: value
    };
  }

  if (Array.isArray(value)) {
    return {
      key,
      label,
      kind: "list",
      items: value.map((item, index) => inferViewerNode(`${key}[${index}]`, `[${index + 1}]`, item))
    };
  }

  if (isRecord(value)) {
    return {
      key,
      label,
      kind: "list",
      items: Object.entries(value).map(([itemKey, itemValue]) => inferViewerNode(`${key}.${itemKey}`, itemKey, itemValue))
    };
  }

  if (value === null || value === undefined) {
    return {
      key,
      label,
      kind: "null"
    };
  }

  return {
    key,
    label,
    kind: "scalar",
    value: typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : String(value)
  };
}

export function getViewerObjects(result: PluginExecutionResult | null): ViewerNode[] {
  if (!result) {
    return [];
  }

  const outputs = isRecord(result.outputs) ? result.outputs : {};
  const viewerPayload = isRecord(outputs.__ireconxViewer) && Array.isArray(outputs.__ireconxViewer.objects) ? outputs.__ireconxViewer : null;

  if (viewerPayload) {
    return (viewerPayload.objects as unknown[])
      .map((item: unknown) => parseViewerNode(item))
      .filter((item): item is ViewerNode => Boolean(item));
  }

  const fallbackObjects: ViewerNode[] = [];

  if (result.dataset) {
    fallbackObjects.push({
      key: "dataset",
      label: "Dataset",
      kind: "table",
      dataset: result.dataset
    });
  }

  Object.entries(outputs)
    .filter(([key]) => key !== "__ireconxViewer")
    .forEach(([key, value]) => {
      fallbackObjects.push(inferViewerNode(`output:${key}`, key, value));
    });

  return fallbackObjects;
}

function escapeCsvCell(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) {
    return "";
  }

  const normalized = String(value);

  if (/[",\n\r]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

function buildDatasetCsv(dataset: StudioDataset) {
  const header = dataset.columns.map((column) => escapeCsvCell(column.label)).join(",");
  const rows = dataset.rows.map((row) =>
    dataset.columns.map((column) => escapeCsvCell(row[column.key])).join(",")
  );

  return [header, ...rows].join("\r\n");
}

export function downloadViewerNodeAsCsv(node: ViewerNode) {
  if (node.kind !== "table") {
    return;
  }

  const blob = new Blob([buildDatasetCsv(node.dataset)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const fileStem = node.dataset.label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "tidyverse-dataset";

  anchor.href = url;
  anchor.download = `${fileStem}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function DatasetTable({ dataset }: { dataset: StudioDataset }) {
  return (
    <div className="overflow-auto rounded-[10px] border border-white/10 bg-slate-950/35">
      <table className="min-w-full border-collapse text-left text-[11px] text-slate-200">
        <thead className="sticky top-0 bg-slate-900/95 text-[10px] uppercase tracking-[0.12em] text-slate-400">
          <tr>
            {dataset.columns.map((column) => (
              <th key={`${dataset.label}-${column.key}`} className="border-b border-white/10 px-3 py-2 font-medium">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataset.rows.length > 0 ? (
            dataset.rows.map((row, index) => (
              <tr key={`${dataset.label}-row-${index}`} className="border-b border-white/5 last:border-b-0">
                {dataset.columns.map((column) => (
                  <td key={`${dataset.label}-${index}-${column.key}`} className="max-w-[240px] px-3 py-2 align-top text-slate-300">
                    {row[column.key] === null || row[column.key] === undefined ? (
                      <span className="text-slate-500">null</span>
                    ) : (
                      String(row[column.key])
                    )}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-3 py-3 text-slate-400" colSpan={Math.max(dataset.columns.length, 1)}>
                This table is empty.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function TidyverseResultPreview({ node }: { node: ViewerNode }) {
  if (node.kind === "table") {
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-300">{`${node.dataset.rowCount} rows · ${node.dataset.columns.length} columns`}</p>
        <DatasetTable dataset={node.dataset} />
      </div>
    );
  }

  if (node.kind === "list") {
    return node.items.length > 0 ? (
      <ul className="space-y-2">
        {node.items.map((item) => (
          <li key={item.key} className="rounded-[10px] border border-white/10 bg-slate-950/25 px-3 py-2">
              <p className="text-xs font-medium text-slate-200">{item.label}</p>
              <div className="mt-2 pl-3">
              <TidyverseResultPreview node={item} />
              </div>
            </li>
          ))}
      </ul>
    ) : (
      <p className="text-xs text-slate-400">This list is empty.</p>
    );
  }

  if (node.kind === "null") {
    return <p className="text-xs text-slate-500">null</p>;
  }

  return <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-slate-300">{String(node.value)}</pre>;
}

export function TidyverseResultViewer({
  result,
  emptyMessage
}: {
  result: PluginExecutionResult | null;
  emptyMessage: string;
}) {
  const objects = useMemo(() => getViewerObjects(result), [result]);
  const [selectedKey, setSelectedKey] = useState<string>("");

  useEffect(() => {
    setSelectedKey(objects[0]?.key ?? "");
  }, [objects]);

  const selectedObject = objects.find((item) => item.key === selectedKey) ?? objects[0] ?? null;

  if (!result) {
    return <p className="text-sm text-slate-400">{emptyMessage}</p>;
  }

  if (objects.length === 0) {
    return <p className="text-sm text-slate-400">This tidyverse result does not expose any inspectable objects yet.</p>;
  }

  return (
    <div className="space-y-3">
      {objects.length > 1 ? (
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Viewer object</span>
          <select
            className="w-full rounded-[10px] border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
            onChange={(event) => setSelectedKey(event.target.value)}
            value={selectedObject?.key ?? ""}
          >
            {objects.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {selectedObject ? (
        <div className="space-y-2 rounded-[10px] border border-white/10 bg-slate-950/35 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-white">{selectedObject.label}</p>
            <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{selectedObject.kind}</span>
          </div>
          <TidyverseResultPreview node={selectedObject} />
        </div>
      ) : null}
    </div>
  );
}
