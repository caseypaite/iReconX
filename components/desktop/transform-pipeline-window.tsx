"use client";

import { ArrowRight, BarChart3, Code2, DatabaseZap, Download, FileSearch2, FileUp, Focus, FolderOpen, Pencil, Play, Power, Puzzle, RefreshCw, Save, Sparkles, Table2, Trash2, Unlink2, X } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PluginHtmlInputForm } from "@/components/desktop/plugin-html-input-form";
import { PluginStudioPanel } from "@/components/desktop/plugin-studio-panel";
import { ResultPreviewViewer } from "@/components/desktop/result-preview-viewer";
import { DesktopWindow, type DesktopWindowFrame } from "@/components/desktop/desktop-window";
import { TidyverseResultPreview, downloadViewerNodeAsCsv, getViewerObjects } from "@/components/desktop/tidyverse-result-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HoverHelperLabel } from "@/components/ui/hover-helper-label";
import { HoverSubtitleTitle } from "@/components/ui/hover-subtitle-title";
import { Input } from "@/components/ui/input";
import type { UserAiSettingsPayload } from "@/lib/ai/provider-config";
import type { AccessibleStudioSource } from "@/lib/data-studio";
import type { ResultViewerPreview } from "@/lib/ai/result-viewer";
import type { StudioDataset } from "@/lib/data-studio";
import { materializePluginParams, parsePluginHtmlInputFields } from "@/lib/plugins/html-inputs";
import { readPluginManifest } from "@/lib/plugins/manifest";
import { runPluginInBrowser } from "@/lib/plugins/browser-runtime";
import { executePluginGraph } from "@/lib/plugins/execution";
import {
  pluginProviderOptions,
  type PluginDefinitionRecord,
  type PluginExecutionResult,
  type PluginExecutionTarget,
  type PluginProviderId
} from "@/lib/plugins/protocol";
import { useStudioWorkspaceStore } from "@/lib/stores/studio-workspace";
import {
  fetchAccessibleStudioSources,
  getImportedDatasetMessage,
  loadWorkspaceDatasetFromSources
} from "@/lib/studio-workspace-loader";
import { sampleTidyverseWorkflow, type TransformWorkflowDocument } from "@/lib/transform-studio/workflow-library";
import type { TidyverseSourceSchemaDefinition } from "@/lib/tidyverse/schema-introspection";
import { type TransformWorkflowStep, workflowNeedsServerExecution } from "@/lib/transform-studio/protocol";
import type { AppRole } from "@/types/auth";

type TransformNodeKind = "source" | "plugin" | "tidyverse-entry" | "tidyverse-script" | "tidyverse-viewer" | "result";

type TransformNode = {
  id: string;
  kind: TransformNodeKind;
  label: string;
  description: string;
  x: number;
  y: number;
  disabled?: boolean;
  pluginId?: string;
  params?: Record<string, unknown>;
  sourceId?: string;
  script?: string;
};

type TransformEdge = {
  id: string;
  from: string;
  to: string;
};

type DragState = {
  nodeId: string;
  pointerOffsetX: number;
  pointerOffsetY: number;
} | null;

type ViewTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

type CanvasSize = {
  width: number;
  height: number;
};

type NodeConfigurationDraft = {
  label: string;
  description: string;
  sourceId: string;
  script: string;
  params: Record<string, unknown>;
  paramsText: string;
};

type SavedWorkflowSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type SavedWorkflowRecord = SavedWorkflowSummary & {
  definition: TransformWorkflowDocument;
};

const compactCardClassName = "rounded-none border-white/10 bg-slate-950/78 p-3 shadow-[0_18px_40px_rgba(15,23,42,0.32)] backdrop-blur-xl";
const compactButtonClassName = "h-auto rounded-none px-2 py-1 text-[11px]";
const compactBadgeClassName = "rounded-none px-1.5 py-0.5 text-[10px]";
const modalTextAreaClassName =
  "min-h-[96px] w-full rounded-[10px] border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400";
const nodeWidth = 168;
const baseNodeHeight = 108;
const minScale = 0.45;
const defaultViewerWindowFrame: DesktopWindowFrame = {
  x: 180,
  y: 72,
  width: 980,
  height: 640
};
const defaultTidyverseScript = [
  'if (is.null(connection) || is.null(db)) stop("Configure Source and route through tidyverse-entry before using database access.")',
  'if (!is.null(source_tbl)) {',
  '  preview_tbl <- source_tbl %>% dplyr::slice_head(n = 20) %>% dplyr::collect()',
  "} else {",
  '  preview_tbl <- dplyr::as_tibble(df_input) %>% dplyr::slice_head(n = 20)',
  "}",
  "result <- list(",
  '  summary = paste("Tidyverse node prepared a lazy preview for", connection$sourceName),',
  "  dataset = preview_tbl,",
  '  outputs = list(schema = if (!is.null(connection$tableSchema) && nzchar(connection$tableSchema)) connection$tableSchema else connection$schema, source = connection$sourceName, lazy = TRUE)',
  ")"
].join("\n");
const defaultRConsoleScript = [
  'log_message("R console started")',
  'if (!is.null(connection) && !is.null(db)) {',
  '  if (!is.null(source_tbl)) {',
  '    preview_tbl <- source_tbl %>% dplyr::slice_head(n = 20) %>% dplyr::collect()',
  '    log_message(paste("Loaded preview from", connection$sourceName, "using lazy dbplyr access"))',
  "  } else {",
  '    preview_tbl <- dplyr::as_tibble(df_input) %>% dplyr::slice_head(n = 20)',
  '    log_message("No source table was provided, using df_input preview instead")',
  "  }",
  "} else {",
  '  preview_tbl <- dplyr::as_tibble(df_input) %>% dplyr::slice_head(n = 20)',
  '  log_message("No workflow connection was available, using df_input only")',
  "}",
  "result <- list(",
  '  summary = "R console executed.",',
  "  dataset = preview_tbl,",
  '  outputs = list(source = if (!is.null(connection)) connection$sourceName else NULL)',
  ")"
].join("\n");
const defaultSourceNodeDescription = "Current Data Studio dataset and shared workflow input.";

const sourceNode: TransformNode = {
  id: "source",
  kind: "source",
  label: "Source",
  description: defaultSourceNodeDescription,
  x: 48,
  y: 140
};

const resultNode: TransformNode = {
  id: "result",
  kind: "result",
  label: "Result",
  description: "Publish final dataset back.",
  x: 860,
  y: 140
};

function describeNode(
  node: TransformNode,
  pluginMap: Map<string, PluginDefinitionRecord>,
  workflowSource: AccessibleStudioSource | null
) {
  if (node.kind === "plugin") {
    const plugin = node.pluginId ? pluginMap.get(node.pluginId) : null;

    return {
      ...node,
      label: node.label || plugin?.name || "Plugin node",
      description: node.description || plugin?.description || "No description provided."
    };
  }

  if (node.kind === "tidyverse-entry") {
    return {
      ...node,
      description:
        node.description ||
        (workflowSource
          ? workflowSource.sourceKind === "persistent-import"
            ? `Passes the Source node persistent import ${workflowSource.tableName} to downstream tidyverse nodes.`
            : `Passes the Source node governed ${workflowSource.type} connection for ${workflowSource.name} to downstream tidyverse nodes.`
          : "Passes the Source node workflow connection downstream into the tidyverse runtime.")
    };
  }

  if (node.kind === "tidyverse-script") {
    return {
      ...node,
      description:
        node.description || "Runs R/tidyverse code against df_input, payload, params, upstream, and the resolved DB connection."
    };
  }

  if (node.kind === "tidyverse-viewer") {
    return {
      ...node,
      description: node.description || "Inspect the latest tidyverse output with object selection, tables, and list trees."
    };
  }

  return node;
}

function getSourceConnectionId(nodes: TransformNode[]) {
  return nodes.find((node) => node.kind === "source")?.sourceId;
}

function normalizeTidyverseEntryNodes(nodes: TransformNode[]) {
  // No-op: preserve sourceId for tidyverse-entry nodes so they can detect Source connection
  return nodes;
}

function getIncomingNodeId(nodeId: string, edges: TransformEdge[]) {
  return edges.find((edge) => edge.to === nodeId)?.from ?? null;
}

function getViewerSourceNodeId(nodeId: string, nodes: TransformNode[], edges: TransformEdge[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  let currentNodeId = getIncomingNodeId(nodeId, edges);

  while (currentNodeId) {
    const currentNode = nodeMap.get(currentNodeId);

    if (!currentNode) {
      return null;
    }

    if (currentNode.kind !== "tidyverse-viewer") {
      return currentNodeId;
    }

    currentNodeId = getIncomingNodeId(currentNodeId, edges);
  }

  return null;
}

function getNodeHeight(nodeId: string, nodeHeights: Record<string, number>) {
  return Math.max(baseNodeHeight, nodeHeights[nodeId] ?? baseNodeHeight);
}

function getPortPosition(node: TransformNode, side: "input" | "output", nodeHeights: Record<string, number>) {
  return {
    x: side === "input" ? node.x : node.x + nodeWidth,
    y: node.y + getNodeHeight(node.id, nodeHeights) / 2
  };
}

function getNodeBounds(nodes: TransformNode[], nodeHeights: Record<string, number>) {
  if (nodes.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: nodeWidth,
      maxY: baseNodeHeight,
      width: nodeWidth,
      height: baseNodeHeight
    };
  }

  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + nodeWidth));
  const maxY = Math.max(...nodes.map((node) => node.y + getNodeHeight(node.id, nodeHeights)));

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function pathExists(startId: string, goalId: string, edges: TransformEdge[]) {
  const queue = [startId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current === goalId) {
      return true;
    }

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);
    edges.filter((edge) => edge.from === current).forEach((edge) => queue.push(edge.to));
  }

  return false;
}

function buildGraphExecutionPlan(nodes: TransformNode[], edges: TransformEdge[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const incomingByTarget = new Map<string, string>();
  const stepsByNodeId = new Map<string, TransformWorkflowStep>();
  const outgoingByNode = new Map<string, TransformWorkflowStep[]>();
  const queue: TransformWorkflowStep[] = [];
  const visited = new Set<string>();
  const steps: TransformWorkflowStep[] = [];
  const effectiveParentCache = new Map<string, string | null>();
  const sourceConnectionId = getSourceConnectionId(nodes) ?? null;

  for (const edge of edges) {
    if (edge.to !== "source") {
      if (incomingByTarget.has(edge.to)) {
        throw new Error("Each plugin block can only accept one input connection.");
      }

      incomingByTarget.set(edge.to, edge.from);
    }
  }

  function getEffectiveParent(nodeId: string): string | null {
    if (effectiveParentCache.has(nodeId)) {
      return effectiveParentCache.get(nodeId) ?? null;
    }

    const parentId = incomingByTarget.get(nodeId) ?? null;

    if (!parentId || parentId === "source") {
      effectiveParentCache.set(nodeId, parentId);
      return parentId;
    }

    const parentNode = nodeMap.get(parentId);

    if (parentNode?.kind === "tidyverse-viewer") {
      const resolved = getEffectiveParent(parentId);
      effectiveParentCache.set(nodeId, resolved);
      return resolved;
    }

    if (parentNode?.kind === "plugin" && parentNode.disabled) {
      const resolved = getEffectiveParent(parentId);
      effectiveParentCache.set(nodeId, resolved);
      return resolved;
    }

    effectiveParentCache.set(nodeId, parentId);
    return parentId;
  }

  function hasTidyverseGatewayAncestor(nodeId: string) {
    let currentParentId = getEffectiveParent(nodeId);

    while (currentParentId) {
      if (currentParentId === "source") {
        return false;
      }

      const currentNode = nodeMap.get(currentParentId);

      if (!currentNode) {
        return false;
      }

      if (currentNode.kind === "tidyverse-entry") {
        return true;
      }

      currentParentId = getEffectiveParent(currentParentId);
    }

    return false;
  }

  for (const node of nodes) {
    if (node.kind === "source" || node.kind === "result" || node.kind === "tidyverse-viewer" || node.disabled) {
      continue;
    }

    const parentNodeId = getEffectiveParent(node.id);

    if (!parentNodeId) {
      continue;
    }

    let step: TransformWorkflowStep;

    if (node.kind === "plugin") {
      if (!node.pluginId) {
        throw new Error("Choose a saved plugin before running this node.");
      }

      step = {
        kind: "plugin",
        nodeId: node.id,
        pluginId: node.pluginId,
        parentNodeId,
        label: node.label,
        params: node.params ?? {}
      };
    } else if (node.kind === "tidyverse-entry") {
      if (!sourceConnectionId) {
        throw new Error("Select a workflow connection in the Source node before running tidyverse nodes.");
      }

      step = {
        kind: "tidyverse-entry",
        nodeId: node.id,
        parentNodeId,
        label: node.label
      };
    } else {
      if (!hasTidyverseGatewayAncestor(node.id)) {
        throw new Error("Route tidyverse scripts through a tidyverse entry node so the Source connection can be forwarded lazily.");
      }

      if (!node.script?.trim()) {
        throw new Error("Add an R script to the tidyverse node before running it.");
      }

      step = {
        kind: "tidyverse-script",
        nodeId: node.id,
        parentNodeId,
        label: node.label,
        script: node.script,
        params: node.params ?? {}
      };
    }

    stepsByNodeId.set(node.id, step);
    outgoingByNode.set(parentNodeId, [...(outgoingByNode.get(parentNodeId) ?? []), step]);
  }

  queue.push(...(outgoingByNode.get("source") ?? []));

  while (queue.length > 0) {
    const step = queue.shift()!;
    const nodeId = step.nodeId;

    if (visited.has(nodeId)) {
      continue;
    }

    visited.add(nodeId);
    steps.push(step);
    queue.push(...(outgoingByNode.get(nodeId) ?? []));
  }

  if (steps.length === 0) {
    throw new Error("Connect at least one executable node to the source node.");
  }

  const resultParentNodeId = getEffectiveParent("result");

  return {
    steps,
    branchCount: (outgoingByNode.get("source") ?? []).length,
    resultParentNodeId,
    sourceConnectionId
  };
}

function buildNodeExecutionPlan(nodes: TransformNode[], edges: TransformEdge[], targetNodeId: string) {
  const fullPlan = buildGraphExecutionPlan(nodes, edges);
  const stepByNodeId = new Map(fullPlan.steps.map((step) => [step.nodeId, step]));
  const lineage: TransformWorkflowStep[] = [];
  let currentStep = stepByNodeId.get(targetNodeId);

  if (!currentStep) {
    throw new Error("Connect this node to Source before running it.");
  }

  while (currentStep) {
    lineage.push(currentStep);
    currentStep = currentStep.parentNodeId === "source" ? undefined : stepByNodeId.get(currentStep.parentNodeId);
  }

  lineage.reverse();

  return {
    steps: lineage,
    branchCount: 1,
    resultParentNodeId: targetNodeId,
    sourceConnectionId: fullPlan.sourceConnectionId
  };
}

export function TransformPipelineWindow({ onOpenImportWizard, role }: { onOpenImportWizard?: () => void; role: AppRole }) {
  const lastUpdatedBy = useStudioWorkspaceStore((state) => state.lastUpdatedBy);
  const sharedDataset = useStudioWorkspaceStore((state) => state.dataset);
  const setWorkspaceDataset = useStudioWorkspaceStore((state) => state.setDataset);
  const [plugins, setPlugins] = useState<PluginDefinitionRecord[]>([]);
  const [sources, setSources] = useState<AccessibleStudioSource[]>([]);
  const [nodes, setNodes] = useState<TransformNode[]>([sourceNode, resultNode]);
  const [edges, setEdges] = useState<TransformEdge[]>([]);
  const [loadingPlugins, setLoadingPlugins] = useState(true);
  const [loadingSources, setLoadingSources] = useState(true);
  const [refreshingSources, setRefreshingSources] = useState(false);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [pendingConnectionFrom, setPendingConnectionFrom] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("source");
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [executionTarget, setExecutionTarget] = useState<PluginExecutionTarget>("browser");
  const [payloadText, setPayloadText] = useState("{}");
  const [execution, setExecution] = useState<{
    results: PluginExecutionResult[];
    finalDataset: StudioDataset | null;
    nodeResults: Record<string, PluginExecutionResult>;
  } | null>(null);
  const [viewTransform, setViewTransform] = useState<ViewTransform>({
    scale: 1,
    offsetX: 0,
    offsetY: 0
  });
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({
    width: 0,
    height: 0
  });
  const [runPending, setRunPending] = useState(false);
  const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [nodeHeights, setNodeHeights] = useState<Record<string, number>>({});
  const [datasetLoadError, setDatasetLoadError] = useState<string | null>(null);
  const [datasetLoadMessage, setDatasetLoadMessage] = useState<string | null>(null);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showExecutionDrawer, setShowExecutionDrawer] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showResultViewerDrawer, setShowResultViewerDrawer] = useState(false);
  const [showRConsoleDrawer, setShowRConsoleDrawer] = useState(false);
  const [showCreatorDrawer, setShowCreatorDrawer] = useState(false);
  const [showPluginPickerModal, setShowPluginPickerModal] = useState(false);
  const [editorPluginId, setEditorPluginId] = useState<string | null>(null);
  const [configModalNodeId, setConfigModalNodeId] = useState<string | null>(null);
  const [nodeConfigDraft, setNodeConfigDraft] = useState<NodeConfigurationDraft | null>(null);
  const [nodeConfigError, setNodeConfigError] = useState<string | null>(null);
  const [lastExecutedNodeId, setLastExecutedNodeId] = useState<string | null>(null);
  const [lastExecutedTidyverseNodeId, setLastExecutedTidyverseNodeId] = useState<string | null>(null);
  const [resultViewerMode, setResultViewerMode] = useState<"table" | "visual">("table");
  const [resultViewerPending, setResultViewerPending] = useState(false);
  const [resultViewerError, setResultViewerError] = useState<string | null>(null);
  const [resultViewer, setResultViewer] = useState<{
    nodeId: string;
    nodeLabel: string;
    result: PluginExecutionResult;
    preview: ResultViewerPreview;
    provider: PluginProviderId;
    model: string;
  } | null>(null);
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflowSummary[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [activeWorkflowName, setActiveWorkflowName] = useState<string | null>(null);
  const [loadingSavedWorkflows, setLoadingSavedWorkflows] = useState(false);
  const [loadingWorkflowId, setLoadingWorkflowId] = useState<string | null>(null);
  const [savingWorkflow, setSavingWorkflow] = useState(false);
  const [showWorkflowLibraryModal, setShowWorkflowLibraryModal] = useState(false);
  const [showWorkflowSaveModal, setShowWorkflowSaveModal] = useState(false);
  const [workflowNameDraft, setWorkflowNameDraft] = useState("");
  const [workflowLibraryError, setWorkflowLibraryError] = useState<string | null>(null);
  const [workflowSaveError, setWorkflowSaveError] = useState<string | null>(null);
  const [rConsoleScript, setRConsoleScript] = useState(defaultRConsoleScript);
  const [rConsolePending, setRConsolePending] = useState(false);
  const [rConsoleError, setRConsoleError] = useState<string | null>(null);
  const [rConsoleMessage, setRConsoleMessage] = useState<string | null>(null);
  const [rConsoleResult, setRConsoleResult] = useState<PluginExecutionResult | null>(null);
  const [rConsoleProvider, setRConsoleProvider] = useState<PluginProviderId>("copilot");
  const [tidyverseAiPrompt, setTidyverseAiPrompt] = useState("");
  const [tidyverseGeneratePending, setTidyverseGeneratePending] = useState(false);
  const [tidyverseAiError, setTidyverseAiError] = useState<string | null>(null);
  const [tidyverseAiMessage, setTidyverseAiMessage] = useState<string | null>(null);
  const [tidyverseGenerationPrompt, setTidyverseGenerationPrompt] = useState("");
  const [tidyverseProviderModel, setTidyverseProviderModel] = useState<string | null>(null);
  const [showTidyverseViewerWindow, setShowTidyverseViewerWindow] = useState(false);
  const [tidyverseViewerWindowFrame, setTidyverseViewerWindowFrame] = useState<DesktopWindowFrame>(defaultViewerWindowFrame);
  const [tidyverseViewerWindowMinimized, setTidyverseViewerWindowMinimized] = useState(false);
  const [tidyverseViewerWindowMaximized, setTidyverseViewerWindowMaximized] = useState(false);
  const [selectedViewerNodeId, setSelectedViewerNodeId] = useState<string>("");
  const [selectedViewerObjectKey, setSelectedViewerObjectKey] = useState<string>("");
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState>(null);
  const nodesRef = useRef<TransformNode[]>([sourceNode, resultNode]);
  const nodeElementMapRef = useRef(new Map<string, HTMLDivElement>());
  const nodeResizeObserverRef = useRef<ResizeObserver | null>(null);

  const pluginMap = useMemo(() => new Map(plugins.map((plugin) => [plugin.id, plugin])), [plugins]);
  const pluginManifestMap = useMemo(
    () => new Map(plugins.map((plugin) => [plugin.id, readPluginManifest(plugin.sourceCode)])),
    [plugins]
  );
  const pluginInputFieldMap = useMemo(
    () =>
      new Map(
        plugins.map((plugin) => [
          plugin.id,
          parsePluginHtmlInputFields(pluginManifestMap.get(plugin.id)?.inputForm)
        ])
      ),
    [pluginManifestMap, plugins]
  );
  useEffect(() => {
    let cancelled = false;

    async function loadDefaultProvider() {
      try {
        const response = await fetch("/api/account/ai-settings", {
          cache: "no-store"
        });
        const payload = (await response.json().catch(() => null)) as (UserAiSettingsPayload & { error?: string }) | null;

        if (!response.ok || !payload?.defaultProvider || cancelled) {
          return;
        }

        setRConsoleProvider(payload.defaultProvider);
      } catch {
        // Keep the built-in default when account settings are unavailable.
      }
    }

    void loadDefaultProvider();

    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!message && !error) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setMessage(null);
      setError(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [error, message]);
  const editorPlugin = editorPluginId ? pluginMap.get(editorPluginId) ?? null : null;
  const tidyverseSources = useMemo(
    () =>
      sources.filter(
        (source) =>
          source.sourceKind === "persistent-import" ||
          (source.sourceKind === "governed-source" && ["POSTGRESQL", "MYSQL"].includes(source.type))
      ),
    [sources]
  );
  const persistentImportSources = useMemo(
    () => tidyverseSources.filter((source) => source.sourceKind === "persistent-import"),
    [tidyverseSources]
  );
  const tidyverseSourceMap = useMemo(() => new Map(tidyverseSources.map((source) => [source.id, source])), [tidyverseSources]);
  const hasTidyverseNodes = useMemo(
    () => nodes.some((node) => node.kind === "tidyverse-entry" || node.kind === "tidyverse-script"),
    [nodes]
  );
  const workflowSourceId = getSourceConnectionId(nodes) ?? "";
  const workflowSource = workflowSourceId ? tidyverseSourceMap.get(workflowSourceId) ?? null : null;
  const sourceDatasetSummary = useMemo(
    () =>
      sharedDataset
        ? {
            label: sharedDataset.label,
            metrics: `${sharedDataset.rowCount} rows · ${sharedDataset.columns.length} columns`
          }
        : null,
    [sharedDataset]
  );
  const displayNodes = useMemo(
    () =>
      nodes.map((node) => {
        if (node.id === "source") {
          return {
            ...node,
            description: sourceDatasetSummary
              ? node.description === defaultSourceNodeDescription
                ? "Current Transform Studio dataset."
                : node.description
              : node.description === defaultSourceNodeDescription
                ? "No dataset loaded. Load a dataset into Transform Studio first."
                : node.description
          };
        }

        return describeNode(node, pluginMap, workflowSource);
      }),
    [nodes, pluginMap, sourceDatasetSummary, workflowSource]
  );
  const getResolvedNodeResult = useCallback(
    (nodeId: string | null) => {
      if (!nodeId || !execution) {
        return null;
      }

      const directResult = execution.nodeResults[nodeId] ?? null;

      if (directResult) {
        return directResult;
      }

      const node = nodes.find((entry) => entry.id === nodeId);

      if (node?.kind === "tidyverse-viewer") {
        const viewerSourceNodeId = getViewerSourceNodeId(node.id, nodes, edges);
        return viewerSourceNodeId ? execution.nodeResults[viewerSourceNodeId] ?? null : null;
      }

      return null;
    },
    [edges, execution, nodes]
  );
  const selectedNode = displayNodes.find((node) => node.id === selectedNodeId) ?? displayNodes[0] ?? null;
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const selectedNodeResult = getResolvedNodeResult(selectedNode?.id ?? null);
  const configModalNode = configModalNodeId ? nodes.find((node) => node.id === configModalNodeId) ?? null : null;
  const configModalDisplayNode =
    configModalNodeId ? displayNodes.find((node) => node.id === configModalNodeId) ?? configModalNode ?? null : null;
  const configModalNodeResult = getResolvedNodeResult(configModalNode?.id ?? null);
  const configModalManifest =
    configModalNode?.kind === "plugin" && configModalNode.pluginId ? pluginManifestMap.get(configModalNode.pluginId) ?? null : null;
  const configModalInputValues =
    configModalNode?.kind === "plugin" && nodeConfigDraft
      ? nodeConfigDraft.params
      : configModalNode?.kind === "plugin" && configModalNode.pluginId
        ? materializePluginParams(pluginInputFieldMap.get(configModalNode.pluginId) ?? [], configModalNode.params)
        : {};
  const configModalTidyverseSource =
    configModalNode?.kind === "source" && nodeConfigDraft?.sourceId
      ? tidyverseSourceMap.get(nodeConfigDraft.sourceId) ?? null
      : null;
  const configModalTidyverseExecutionPlan = useMemo(() => {
    if (!configModalNode || configModalNode.kind !== "tidyverse-script") {
      return null;
    }

    try {
      return buildNodeExecutionPlan(nodes, edges, configModalNode.id);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Route this tidyverse step through a tidyverse-entry node."
      };
    }
  }, [configModalNode, edges, nodes]);
  const configModalTidyverseGatewayStep =
    configModalNode?.kind === "tidyverse-script" && configModalTidyverseExecutionPlan && "steps" in configModalTidyverseExecutionPlan
      ? [...configModalTidyverseExecutionPlan.steps].reverse().find((step) => step.kind === "tidyverse-entry") ?? null
      : null;
  const configModalTidyversePlanError = useMemo(() => {
    if (!configModalNode || configModalNode.kind !== "tidyverse-script") {
      return null;
    }

    if (!configModalTidyverseExecutionPlan || "steps" in configModalTidyverseExecutionPlan) {
      return null;
    }

    return configModalTidyverseExecutionPlan.error;
  }, [configModalNode, configModalTidyverseExecutionPlan]);
  const configModalTidyverseGatewayNode = configModalTidyverseGatewayStep
    ? displayNodes.find((node) => node.id === configModalTidyverseGatewayStep.nodeId) ?? null
    : null;
  const configModalTidyverseGatewayResult = configModalTidyverseGatewayStep
    ? getResolvedNodeResult(configModalTidyverseGatewayStep.nodeId)
    : null;
  const configModalTidyverseGatewaySchema =
    configModalTidyverseGatewayResult?.outputs &&
    typeof configModalTidyverseGatewayResult.outputs === "object" &&
    "sourceSchema" in configModalTidyverseGatewayResult.outputs
      ? (configModalTidyverseGatewayResult.outputs.sourceSchema as TidyverseSourceSchemaDefinition | null | undefined) ?? null
      : null;
  const configModalTidyverseGatewaySource =
    configModalNode?.kind === "tidyverse-script" &&
    configModalTidyverseExecutionPlan &&
    "steps" in configModalTidyverseExecutionPlan &&
    configModalTidyverseExecutionPlan.sourceConnectionId
      ? tidyverseSourceMap.get(configModalTidyverseExecutionPlan.sourceConnectionId) ?? null
      : null;
  const configModalTidyverseGatewayDataDictionary =
    configModalTidyverseGatewayResult?.outputs &&
    typeof configModalTidyverseGatewayResult.outputs === "object" &&
    "sourceDataDictionary" in configModalTidyverseGatewayResult.outputs
      ? (configModalTidyverseGatewayResult.outputs.sourceDataDictionary as string | null | undefined) ??
        configModalTidyverseGatewaySource?.dataDictionary ??
        null
      : configModalTidyverseGatewaySource?.dataDictionary ?? null;
  const primaryTidyverseGatewayNode = useMemo(
    () => displayNodes.find((node) => node.kind === "tidyverse-entry") ?? null,
    [displayNodes]
  );
  const primaryTidyverseGatewayResult = getResolvedNodeResult(primaryTidyverseGatewayNode?.id ?? null);
  const primaryTidyverseGatewaySchema =
    primaryTidyverseGatewayResult?.outputs &&
    typeof primaryTidyverseGatewayResult.outputs === "object" &&
    "sourceSchema" in primaryTidyverseGatewayResult.outputs
      ? (primaryTidyverseGatewayResult.outputs.sourceSchema as TidyverseSourceSchemaDefinition | null | undefined) ?? null
      : null;
  const configModalViewerSourceNodeId =
    configModalNode?.kind === "tidyverse-viewer" ? getViewerSourceNodeId(configModalNode.id, nodes, edges) : null;
  const configModalViewerSourceNode = configModalViewerSourceNodeId
    ? displayNodes.find((node) => node.id === configModalViewerSourceNodeId) ?? null
    : null;
  const lastExecutedNode = lastExecutedNodeId ? displayNodes.find((node) => node.id === lastExecutedNodeId) ?? null : null;
  const lastExecutedNodeResult = lastExecutedNodeId && execution ? execution.nodeResults[lastExecutedNodeId] ?? null : null;
  const tidyverseViewerCandidateNodes = useMemo(
    () =>
      displayNodes.filter((node) => {
        if (node.kind !== "tidyverse-script") {
          return false;
        }

        return Boolean(getResolvedNodeResult(node.id));
      }),
    [displayNodes, getResolvedNodeResult]
  );
  const activeViewerNodeId =
    selectedViewerNodeId && tidyverseViewerCandidateNodes.some((node) => node.id === selectedViewerNodeId)
      ? selectedViewerNodeId
      : lastExecutedTidyverseNodeId && tidyverseViewerCandidateNodes.some((node) => node.id === lastExecutedTidyverseNodeId)
        ? lastExecutedTidyverseNodeId
        : tidyverseViewerCandidateNodes[0]?.id ?? "";
  const activeViewerNode = activeViewerNodeId ? displayNodes.find((node) => node.id === activeViewerNodeId) ?? null : null;
  const activeViewerResult = getResolvedNodeResult(activeViewerNodeId);
  const activeViewerObjects = useMemo(() => getViewerObjects(activeViewerResult), [activeViewerResult]);
  const activeViewerObject =
    activeViewerObjects.find((item) => item.key === selectedViewerObjectKey) ?? activeViewerObjects[0] ?? null;
  const executionPending = runPending || runningNodeId !== null;
  const allBlocksExpanded =
    showLeftPanel && showExecutionDrawer && showRightPanel && showResultViewerDrawer && showRConsoleDrawer && showCreatorDrawer;
  const chainSummary = useMemo(() => {
    try {
      const plan = buildGraphExecutionPlan(nodes, edges);
      const publishTarget =
        plan.resultParentNodeId === "source"
          ? "Source"
          : plan.resultParentNodeId
            ? displayNodes.find((node) => node.id === plan.resultParentNodeId)?.label ?? "Connected branch"
            : null;

      return `${plan.steps.length} workflow node${plan.steps.length === 1 ? "" : "s"} across ${Math.max(plan.branchCount, 1)} branch${
        Math.max(plan.branchCount, 1) === 1 ? "" : "es"
      }${publishTarget ? `. Result publishes ${publishTarget}.` : ". Connect a branch to Result to publish a final dataset."}`;
    } catch {
      return "Connect Source to one or more workflow branches. One branch may optionally feed Result for publishing.";
    }
  }, [displayNodes, edges, nodes]);

  const centerAndFitNodes = useCallback((targetNodes: TransformNode[]) => {
    if (canvasSize.width === 0 || canvasSize.height === 0) {
      return;
    }

    const bounds = getNodeBounds(targetNodes, nodeHeights);
    const padding = 72;
    const availableWidth = Math.max(1, canvasSize.width - padding * 2);
    const availableHeight = Math.max(1, canvasSize.height - padding * 2);
    const fittedScale = Math.min(1, availableWidth / Math.max(bounds.width, 1), availableHeight / Math.max(bounds.height, 1));
    const scale = Math.max(minScale, fittedScale);

    setViewTransform({
      scale,
      offsetX: (canvasSize.width - bounds.width * scale) / 2 - bounds.minX * scale,
      offsetY: (canvasSize.height - bounds.height * scale) / 2 - bounds.minY * scale
    });
  }, [canvasSize.height, canvasSize.width, nodeHeights]);

  function serializeWorkflowDefinition(): TransformWorkflowDocument {
    return {
      version: 1,
      nodes: normalizeTidyverseEntryNodes(nodes),
      edges,
      selectedSourceIds,
      executionTarget,
      payloadText
    };
  }

  function applyWorkflowDefinition(
    definition: TransformWorkflowDocument,
    options?: {
      workflowId?: string | null;
      workflowName?: string | null;
      bindFirstAccessibleSources?: boolean;
      successMessage?: string;
    }
  ) {
    const availableSourceIds = new Set(sources.map((source) => source.id));
    const preferredSampleSourceId = options?.bindFirstAccessibleSources ? persistentImportSources[0]?.id : undefined;
    const seenNodeIds = new Set<string>();
    const warnings: string[] = [];
    const loadedSourceNode = definition.nodes.find((node) => node.kind === "source");
    const loadedResultNode = definition.nodes.find((node) => node.kind === "result");
    const legacyTidyverseSourceId = definition.nodes.find((node) => node.kind === "tidyverse-entry" && node.sourceId)?.sourceId;
    const loadedSourceConnectionId =
      loadedSourceNode?.sourceId && tidyverseSourceMap.has(loadedSourceNode.sourceId)
        ? loadedSourceNode.sourceId
        : legacyTidyverseSourceId && tidyverseSourceMap.has(legacyTidyverseSourceId)
          ? legacyTidyverseSourceId
          : options?.bindFirstAccessibleSources
            ? preferredSampleSourceId
            : undefined;

    if (options?.bindFirstAccessibleSources && !preferredSampleSourceId) {
      warnings.push("Import a file into the persistent store, then choose that imported table in the Source node before running the sample.");
    }

    const nextExecutableNodes = definition.nodes
      .filter((node) => node.kind !== "source" && node.kind !== "result")
      .filter((node) => {
        if (seenNodeIds.has(node.id) || node.id === "source" || node.id === "result") {
          return false;
        }

        seenNodeIds.add(node.id);
        return true;
      })
      .map((node) => {
        if (node.kind === "tidyverse-entry") {
          if (node.sourceId && !loadedSourceConnectionId) {
            warnings.push(`The workflow connection for "${node.label}" is no longer available and must be reselected in Source.`);
          }

          return {
            ...node,
            sourceId: undefined
          };
        }

        if (node.kind === "plugin" && node.pluginId && !pluginMap.has(node.pluginId)) {
          warnings.push(`Plugin "${node.label}" references a saved JavaScript node that is not currently available.`);
        }

        return node;
      });
    const nextNodes = normalizeTidyverseEntryNodes([
      {
        ...sourceNode,
        ...(loadedSourceNode ?? {}),
        sourceId: loadedSourceConnectionId,
        id: "source",
        kind: "source" as const
      },
      ...nextExecutableNodes,
      {
        ...resultNode,
        ...(loadedResultNode ?? {}),
        id: "result",
        kind: "result" as const
      }
    ]);
    const validNodeIds = new Set(nextNodes.map((node) => node.id));
    const edgeKeys = new Set<string>();
    const nextEdges = definition.edges
      .filter((edge) => validNodeIds.has(edge.from) && validNodeIds.has(edge.to) && edge.from !== "result" && edge.to !== "source")
      .filter((edge) => {
        const key = `${edge.from}-${edge.to}`;

        if (edgeKeys.has(key)) {
          return false;
        }

        edgeKeys.add(key);
        return true;
      })
      .map((edge) => ({
        id: `${edge.from}-${edge.to}`,
        from: edge.from,
        to: edge.to
      }));
    const nextSelectedSourceIds = definition.selectedSourceIds.filter((sourceId) => availableSourceIds.has(sourceId));
    const boundSelectedSourceIds =
      options?.bindFirstAccessibleSources && nextSelectedSourceIds.length === 0 && preferredSampleSourceId
        ? [preferredSampleSourceId]
        : nextSelectedSourceIds;
    const nextSelectedNodeId =
      nextNodes.find(
        (node) =>
          node.kind === "tidyverse-script" ||
          node.kind === "plugin" ||
          node.kind === "tidyverse-entry" ||
          node.kind === "tidyverse-viewer"
      )?.id ??
      "source";

    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedSourceIds(boundSelectedSourceIds);
    setExecutionTarget(nextNodes.some((node) => node.kind === "tidyverse-entry" || node.kind === "tidyverse-script") ? "server" : definition.executionTarget);
    setPayloadText(definition.payloadText);
    setSelectedNodeId(nextSelectedNodeId);
    setSelectedEdgeId(null);
    setPendingConnectionFrom(null);
    setExecution(null);
    setLastExecutedNodeId(null);
    setLastExecutedTidyverseNodeId(null);
    setResultViewer(null);
    setResultViewerError(null);
    setSelectedViewerNodeId("");
    setSelectedViewerObjectKey("");
    setConfigModalNodeId(null);
    setActiveWorkflowId(options?.workflowId ?? null);
    setActiveWorkflowName(options?.workflowName ?? null);
    setError(null);
    setRConsoleError(null);
    setRConsoleMessage(null);
    setRConsoleResult(null);
    setMessage(
      warnings.length > 0
        ? `${options?.successMessage ?? "Workflow loaded."} ${warnings[0]}`
        : (options?.successMessage ?? "Workflow loaded.")
    );
    window.requestAnimationFrame(() => centerAndFitNodes(nextNodes));
  }

  function openSaveWorkflowModal() {
    setWorkflowSaveError(null);
    setWorkflowNameDraft(activeWorkflowName ?? "");
    setShowWorkflowSaveModal(true);
  }

  async function openWorkflowLibraryModal() {
    setShowWorkflowLibraryModal(true);
    setWorkflowLibraryError(null);
    await loadSavedWorkflows();
  }

  const loadPlugins = useCallback(async () => {
    setLoadingPlugins(true);
    setError(null);

    try {
      const response = await fetch("/api/plugins", {
        cache: "no-store"
      });
      const body = (await response.json().catch(() => null)) as { error?: string; plugins?: PluginDefinitionRecord[] } | null;

      if (!response.ok || !body?.plugins) {
        throw new Error(body?.error ?? "Unable to load plugins.");
      }

      setPlugins(body.plugins);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load plugins.");
    } finally {
      setLoadingPlugins(false);
    }
  }, []);

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  const loadSources = useCallback(async (initialLoad = false) => {
    if (initialLoad) {
      setLoadingSources(true);
    } else {
      setRefreshingSources(true);
    }

    setDatasetLoadError(null);

    try {
      setSources(await fetchAccessibleStudioSources());
    } catch (caughtError) {
      setDatasetLoadError(caughtError instanceof Error ? caughtError.message : "Unable to load governed data sources.");
    } finally {
      setLoadingSources(false);
      setRefreshingSources(false);
    }
  }, []);

  useEffect(() => {
    void loadSources(true);
  }, [loadSources]);

  useEffect(() => {
    if (loadingSources) {
      return;
    }

    const availableSourceIds = new Set(sources.map((source) => source.id));
    const availableWorkflowSourceIds = new Set(tidyverseSources.map((source) => source.id));
    setSelectedSourceIds((current) => current.filter((sourceId) => availableSourceIds.has(sourceId)));
    setNodes((current) =>
      normalizeTidyverseEntryNodes(
        current.map((node) =>
          node.kind === "source" && node.sourceId && !availableWorkflowSourceIds.has(node.sourceId)
            ? { ...node, sourceId: undefined }
            : node
        )
      )
    );
  }, [loadingSources, sources, tidyverseSources]);

  useEffect(() => {
    if (!activeViewerNodeId) {
      setSelectedViewerNodeId("");
      return;
    }

    setSelectedViewerNodeId(activeViewerNodeId);
  }, [activeViewerNodeId]);

  useEffect(() => {
    setSelectedViewerObjectKey(activeViewerObjects[0]?.key ?? "");
  }, [activeViewerObjects]);

  const loadSavedWorkflows = useCallback(async () => {
    setLoadingSavedWorkflows(true);
    setWorkflowLibraryError(null);

    try {
      const response = await fetch("/api/transform-studio/workflows", {
        cache: "no-store"
      });
      const body = (await response.json().catch(() => null)) as
        | {
            error?: string;
            workflows?: SavedWorkflowSummary[];
          }
        | null;

      if (!response.ok || !body?.workflows) {
        throw new Error(body?.error ?? "Unable to load saved workflows.");
      }

      setSavedWorkflows(body.workflows);
    } catch (caughtError) {
      setWorkflowLibraryError(caughtError instanceof Error ? caughtError.message : "Unable to load saved workflows.");
    } finally {
      setLoadingSavedWorkflows(false);
    }
  }, []);

  useEffect(() => {
    if (lastUpdatedBy === "import-wizard" && sharedDataset) {
      setDatasetLoadMessage(getImportedDatasetMessage(sharedDataset));
      setDatasetLoadError(null);
    }
  }, [lastUpdatedBy, sharedDataset]);

  useEffect(() => {
    if (!showWorkflowLibraryModal && !showWorkflowSaveModal) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowWorkflowLibraryModal(false);
        setShowWorkflowSaveModal(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showWorkflowLibraryModal, showWorkflowSaveModal]);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      setNodeHeights((currentHeights) => {
        let nextHeights = currentHeights;

        for (const entry of entries) {
          const nodeId = (entry.target as HTMLDivElement).dataset.nodeId;

          if (!nodeId) {
            continue;
          }

          const measuredHeight = Math.max(baseNodeHeight, Math.ceil(entry.contentRect.height));

          if (currentHeights[nodeId] === measuredHeight) {
            continue;
          }

          if (nextHeights === currentHeights) {
            nextHeights = { ...currentHeights };
          }

          nextHeights[nodeId] = measuredHeight;
        }

        return nextHeights;
      });
    });

    nodeResizeObserverRef.current = observer;
    nodeElementMapRef.current.forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
      nodeResizeObserverRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (hasTidyverseNodes && executionTarget !== "server") {
      setExecutionTarget("server");
    }
  }, [executionTarget, hasTidyverseNodes]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    if (!configModalNode) {
      setNodeConfigDraft(null);
      setNodeConfigError(null);
      setTidyverseAiPrompt("");
      setTidyverseAiError(null);
      setTidyverseAiMessage(null);
      setTidyverseGenerationPrompt("");
      setTidyverseProviderModel(null);
      return;
    }

    const pluginParams =
      configModalNode.kind === "plugin" && configModalNode.pluginId
        ? materializePluginParams(pluginInputFieldMap.get(configModalNode.pluginId) ?? [], configModalNode.params)
        : (configModalNode.params ?? {});

    setNodeConfigDraft({
      label: configModalNode.label,
      description: configModalNode.description,
      sourceId: configModalNode.sourceId ?? "",
      script: configModalNode.script ?? "",
      params: pluginParams,
      paramsText: JSON.stringify(configModalNode.params ?? {}, null, 2)
    });
    setNodeConfigError(null);
    setTidyverseAiPrompt("");
    setTidyverseAiError(null);
    setTidyverseAiMessage(null);
    setTidyverseGenerationPrompt("");
    setTidyverseProviderModel(null);
  }, [configModalNodeId, configModalNode, pluginInputFieldMap]);

  useEffect(() => {
    if (!configModalNodeId) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setConfigModalNodeId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [configModalNodeId]);

  useEffect(() => {
    if (!showPluginPickerModal) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowPluginPickerModal(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showPluginPickerModal]);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const updateSize = () => {
      if (!canvasRef.current) {
        return;
      }

      const rect = canvasRef.current.getBoundingClientRect();
      setCanvasSize({
        width: rect.width,
        height: rect.height
      });
    };

    updateSize();

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(canvasRef.current);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (canvasSize.width === 0 || canvasSize.height === 0) {
      return;
    }

    centerAndFitNodes(nodesRef.current);
  }, [canvasSize.height, canvasSize.width, centerAndFitNodes, nodes.length]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (!dragStateRef.current || !canvasRef.current) {
        return;
      }

      const rect = canvasRef.current.getBoundingClientRect();
      const worldX = (event.clientX - rect.left - viewTransform.offsetX) / viewTransform.scale;
      const worldY = (event.clientY - rect.top - viewTransform.offsetY) / viewTransform.scale;
      const { nodeId, pointerOffsetX, pointerOffsetY } = dragStateRef.current;

      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                x: worldX - pointerOffsetX,
                y: worldY - pointerOffsetY
              }
            : node
        )
      );
    }

    function handlePointerUp() {
      dragStateRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [viewTransform.offsetX, viewTransform.offsetY, viewTransform.scale]);

  function parsePayload() {
    try {
      const parsed = JSON.parse(payloadText);

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Payload must be a JSON object.");
      }

      return parsed as Record<string, unknown>;
    } catch (caughtError) {
      throw new Error(caughtError instanceof Error ? caughtError.message : "Payload must be valid JSON.");
    }
  }

  function registerNodeElement(nodeId: string, element: HTMLDivElement | null) {
    const currentElement = nodeElementMapRef.current.get(nodeId);

    if (currentElement === element) {
      return;
    }

    if (currentElement && nodeResizeObserverRef.current) {
      nodeResizeObserverRef.current.unobserve(currentElement);
    }

    if (!element) {
      nodeElementMapRef.current.delete(nodeId);
      setNodeHeights((currentHeights) => {
        if (!(nodeId in currentHeights)) {
          return currentHeights;
        }

        const nextHeights = { ...currentHeights };
        delete nextHeights[nodeId];
        return nextHeights;
      });
      return;
    }

    nodeElementMapRef.current.set(nodeId, element);
    nodeResizeObserverRef.current?.observe(element);
  }

  function updateNode(nodeId: string, updates: Partial<TransformNode>) {
    setNodes((current) =>
      normalizeTidyverseEntryNodes(current.map((node) => (node.id === nodeId ? { ...node, ...updates } : node)))
    );
  }

  function getNodeConfigurationUpdates() {
    if (!configModalNode || !nodeConfigDraft) {
      return null;
    }

    const nextLabel = nodeConfigDraft.label.trim();

    if (!nextLabel) {
      setNodeConfigError("Node title is required.");
      return null;
    }

    let nextParams = configModalNode.params ?? {};

    if (configModalNode.kind === "plugin") {
      nextParams = nodeConfigDraft.params;
    }

    if (configModalNode.kind === "tidyverse-script") {
      try {
        const parsed = JSON.parse(nodeConfigDraft.paramsText);

        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Params must be a JSON object.");
        }

        nextParams = parsed as Record<string, unknown>;
      } catch (caughtError) {
        setNodeConfigError(caughtError instanceof Error ? caughtError.message : "Params must be valid JSON.");
        return null;
      }
    }

    setNodeConfigError(null);

    return {
      label: nextLabel,
      description: nodeConfigDraft.description.trim(),
      sourceId: configModalNode.kind === "source" ? nodeConfigDraft.sourceId || undefined : undefined,
      script: configModalNode.kind === "tidyverse-script" ? nodeConfigDraft.script : configModalNode.script,
      params: nextParams
    } satisfies Partial<TransformNode>;
  }

  function addPluginNode(plugin: PluginDefinitionRecord) {
    const id = `plugin-${plugin.id}-${Math.random().toString(36).slice(2, 8)}`;
    const defaultParams = materializePluginParams(pluginInputFieldMap.get(plugin.id) ?? [], undefined);
    const existingExecutableNodes = nodes.filter(
      (node) =>
        node.kind === "plugin" ||
        node.kind === "tidyverse-entry" ||
        node.kind === "tidyverse-script" ||
        node.kind === "tidyverse-viewer"
    ).length;

    setNodes((current) => [
      ...current,
      {
        id,
        kind: "plugin",
        label: plugin.name,
        description: plugin.description || "No description provided.",
        pluginId: plugin.id,
        params: defaultParams,
        x: 220 + existingExecutableNodes * 42,
        y: 68 + existingExecutableNodes * 28
      }
    ]);
    setSelectedNodeId(id);
    setMessage(null);
    setError(null);
  }

  function addTidyverseEntryNode() {
    const id = `tidyverse-entry-${Math.random().toString(36).slice(2, 8)}`;
    const existingExecutableNodes = nodes.filter(
      (node) =>
        node.kind === "plugin" ||
        node.kind === "tidyverse-entry" ||
        node.kind === "tidyverse-script" ||
        node.kind === "tidyverse-viewer"
    ).length;

    setNodes((current) => [
      ...current,
        {
          id,
          kind: "tidyverse-entry",
          label: "Tidyverse entry",
          description: "Pick up the Source node workflow connection and pass it to downstream tidyverse nodes.",
          x: 220 + existingExecutableNodes * 42,
          y: 68 + existingExecutableNodes * 28
        }
    ]);
    setSelectedNodeId(id);
    setMessage(null);
    setError(null);
  }

  function addTidyverseScriptNode() {
    const id = `tidyverse-script-${Math.random().toString(36).slice(2, 8)}`;
    const existingExecutableNodes = nodes.filter(
      (node) =>
        node.kind === "plugin" ||
        node.kind === "tidyverse-entry" ||
        node.kind === "tidyverse-script" ||
        node.kind === "tidyverse-viewer"
    ).length;

    setNodes((current) => [
      ...current,
      {
        id,
        kind: "tidyverse-script",
        label: "Tidyverse step",
        description: "Run R/tidyverse logic with df_input, payload, params, upstream, connection, and db.",
        script: defaultTidyverseScript,
        params: {},
        x: 220 + existingExecutableNodes * 42,
        y: 68 + existingExecutableNodes * 28
      }
    ]);
    setSelectedNodeId(id);
    setMessage(null);
    setError(null);
  }

  function beginDrag(nodeId: string, event: ReactPointerEvent<HTMLDivElement>) {
    if (!canvasRef.current) {
      return;
    }

    const node = nodes.find((entry) => entry.id === nodeId);

    if (!node) {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const worldX = (event.clientX - rect.left - viewTransform.offsetX) / viewTransform.scale;
    const worldY = (event.clientY - rect.top - viewTransform.offsetY) / viewTransform.scale;

    dragStateRef.current = {
      nodeId,
      pointerOffsetX: worldX - node.x,
      pointerOffsetY: worldY - node.y
    };
  }

  function removeNode(nodeId: string) {
    if (nodeId === "source" || nodeId === "result") {
      return;
    }

    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.from !== nodeId && edge.to !== nodeId));
    setSelectedNodeId((current) => (current === nodeId ? "source" : current));
    setSelectedEdgeId(null);
    setPendingConnectionFrom((current) => (current === nodeId ? null : current));
    setConfigModalNodeId((current) => (current === nodeId ? null : current));
  }

  function removeEdge(edgeId: string) {
    setEdges((current) => current.filter((edge) => edge.id !== edgeId));
    setSelectedEdgeId((current) => (current === edgeId ? null : current));
    setPendingConnectionFrom(null);
  }

  function connectNodes(fromId: string, toId: string) {
    if (fromId === toId) {
      setPendingConnectionFrom(null);
      return;
    }

    const fromNode = nodes.find((node) => node.id === fromId);
    const toNode = nodes.find((node) => node.id === toId);

    if (!fromNode || !toNode || fromNode.kind === "result" || toNode.kind === "source") {
      setPendingConnectionFrom(null);
      return;
    }

    setEdges((current) => {
      const trimmed = current.filter((edge) => edge.to !== toId && !(edge.from === fromId && edge.to === toId));

      if (pathExists(toId, fromId, trimmed)) {
        setError("This connection would create a cycle in the pipeline.");
        return current;
      }

      setError(null);

      return [
        ...trimmed,
        {
          id: `${fromId}-${toId}`,
          from: fromId,
          to: toId
        }
      ];
    });

    setSelectedEdgeId(`${fromId}-${toId}`);
    setPendingConnectionFrom(null);
  }

  function toggleNodeDisabled(nodeId: string) {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId && node.kind !== "source" && node.kind !== "result"
          ? { ...node, disabled: !node.disabled }
          : node
      )
    );
    setPendingConnectionFrom(null);
    setSelectedEdgeId(null);
    setMessage(null);
    setError(null);
  }

  function openNodeConfiguration(nodeId: string) {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setPendingConnectionFrom(null);
    setConfigModalNodeId(nodeId);
  }

  function toggleAllBlocks() {
    const nextExpanded = !allBlocksExpanded;
    setShowLeftPanel(nextExpanded);
    setShowExecutionDrawer(nextExpanded);
    setShowRightPanel(nextExpanded);
    setShowResultViewerDrawer(nextExpanded);
    setShowRConsoleDrawer(nextExpanded);
    setShowCreatorDrawer(nextExpanded);
  }

  function openTidyverseViewerWindow(nodeId?: string | null) {
    setShowTidyverseViewerWindow(true);
    setTidyverseViewerWindowMinimized(false);

    if (nodeId) {
      setSelectedViewerNodeId(nodeId);
    }
  }

  function openPluginPicker() {
    setShowPluginPickerModal(true);

    if (plugins.length === 0 && !loadingPlugins) {
      void loadPlugins();
    }
  }

  function saveNodeConfiguration() {
    if (!configModalNode) {
      return;
    }

    const updates = getNodeConfigurationUpdates();

    if (!updates) {
      return;
    }

    updateNode(configModalNode.id, updates);
    setConfigModalNodeId(null);
  }

  async function executeGraphPlan(
    plan: ReturnType<typeof buildGraphExecutionPlan>,
    options?: {
      successMessage?: string;
      runningNodeId?: string | null;
    }
  ) {
    if (options?.runningNodeId) {
      setRunningNodeId(options.runningNodeId);
    } else {
      setRunPending(true);
    }

    setError(null);
    setMessage(null);

    try {
      const payload = parsePayload();
      const pluginSteps = plan.steps.filter((step): step is Extract<TransformWorkflowStep, { kind: "plugin" }> => step.kind === "plugin");
      const referencedPluginIds = Array.from(new Set(pluginSteps.map((step) => step.pluginId)));
      const selectedPlugins = plugins.filter((plugin) => referencedPluginIds.includes(plugin.id));
      const requiresServerExecution = executionTarget === "server" || workflowNeedsServerExecution(plan.steps);
      const sourceConnectionId = plan.sourceConnectionId ?? null;

      if (requiresServerExecution || Boolean(sourceConnectionId)) {
        const response = await fetch("/api/transform-studio/run", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            executionTarget: "server",
            dataset: sharedDataset ?? null,
            payload,
            sourceConnectionId,
            graphSteps: plan.steps,
            resultParentNodeId: plan.resultParentNodeId
          })
        });
        const body = (await response.json().catch(() => null)) as
          | {
              error?: string;
              results?: PluginExecutionResult[];
              finalDataset?: StudioDataset | null;
            }
          | null;

        if (!response.ok || !body?.results) {
          throw new Error(body?.error ?? "Unable to execute the workflow.");
        }

        const nodeResults = Object.fromEntries(body.results.map((result, index) => [plan.steps[index]?.nodeId, result]).filter(([nodeId]) => Boolean(nodeId)));
        const executedNodeId = plan.steps[Math.max(body.results.length - 1, 0)]?.nodeId ?? null;
        const executedTidyverseNodeId =
          [...plan.steps].reverse().find((step) => step.kind === "tidyverse-script")?.nodeId ?? null;
        setExecution({
          results: body.results,
          finalDataset: body.finalDataset ?? null,
          nodeResults
        });
        setLastExecutedNodeId(executedNodeId);
        setLastExecutedTidyverseNodeId(executedTidyverseNodeId);
        if (executedTidyverseNodeId) {
          openTidyverseViewerWindow(executedTidyverseNodeId);
        }
      } else {
        const result = await executePluginGraph({
          definitions: selectedPlugins,
          initialDataset: sharedDataset,
          payload,
          initialConnection: null,
          executionTarget: "browser",
          steps: pluginSteps,
          resultParentNodeId: plan.resultParentNodeId,
          runPlugin: runPluginInBrowser
        });

        const nodeResults = Object.fromEntries(result.results.map((entry, index) => [plan.steps[index]?.nodeId, entry]).filter(([nodeId]) => Boolean(nodeId)));
        const executedNodeId = plan.steps[Math.max(result.results.length - 1, 0)]?.nodeId ?? null;
        setExecution({
          ...result,
          nodeResults
        });
        setLastExecutedNodeId(executedNodeId);
        setLastExecutedTidyverseNodeId(null);
      }

      setResultViewer(null);
      setResultViewerError(null);
      setMessage(options?.successMessage ?? "Workflow executed.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to execute the workflow.");
    } finally {
      setRunPending(false);
      setRunningNodeId(null);
    }
  }

  async function runPipeline() {
    if (executionPending) {
      return;
    }

    try {
      await executeGraphPlan(buildGraphExecutionPlan(nodes, edges));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to execute the workflow.");
      setMessage(null);
    }
  }

  async function runNode(node: TransformNode, targetNodes: TransformNode[] = nodes) {
    if (executionPending) {
      return;
    }

    if (node.kind === "source" || node.kind === "result") {
      await runPipeline();
      return;
    }

    if (node.kind === "tidyverse-viewer") {
      const viewerSourceNodeId = getViewerSourceNodeId(node.id, targetNodes, edges);
      const viewerSourceNode = viewerSourceNodeId ? targetNodes.find((entry) => entry.id === viewerSourceNodeId) ?? null : null;
      const fallbackViewerNode =
        lastExecutedTidyverseNodeId ? targetNodes.find((entry) => entry.id === lastExecutedTidyverseNodeId) ?? null : null;
      const targetViewerNode = viewerSourceNode ?? fallbackViewerNode;

      if (!targetViewerNode || targetViewerNode.kind !== "tidyverse-script") {
        setError("Run a tidyverse-script node first, or connect this viewer to one, before opening the tidyverse viewer.");
        setMessage(null);
        return;
      }

      await runNode(targetViewerNode, targetNodes);
      openTidyverseViewerWindow(targetViewerNode.id);
      setSelectedNodeId(node.id);
      return;
    }

    if (node.disabled) {
      setError("Enable this node before running it.");
      setMessage(null);
      return;
    }

    try {
      await executeGraphPlan(buildNodeExecutionPlan(targetNodes, edges, node.id), {
        successMessage: `${node.label} executed.`,
        runningNodeId: node.id
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to execute this node.");
      setMessage(null);
    }
  }

  async function runNodeFromModal() {
    if (!configModalNode || configModalNode.kind === "source" || configModalNode.kind === "result" || configModalNode.disabled) {
      return;
    }

    const updates = getNodeConfigurationUpdates();

    if (!updates) {
      return;
    }

    const nextNodes = normalizeTidyverseEntryNodes(
      nodes.map((node) => (node.id === configModalNode.id ? { ...node, ...updates } : node))
    );
    const nextNode = nextNodes.find((node) => node.id === configModalNode.id);

    if (!nextNode) {
      return;
    }

    setNodes(nextNodes);
    setSelectedNodeId(nextNode.id);
    await runNode(nextNode, nextNodes);
  }

  function publishResultDataset() {
    if (!execution?.finalDataset) {
      return;
    }

    setWorkspaceDataset(execution.finalDataset, "transform-studio");
    setMessage("Final dataset published back to Data Studio.");
  }

  async function loadSelectedSourcesDataset() {
    try {
      const result = await loadWorkspaceDatasetFromSources(sources, selectedSourceIds);
      setWorkspaceDataset(result.dataset, "transform-studio");
      setDatasetLoadMessage(result.message ?? "Dataset loaded into Transform Studio.");
      setDatasetLoadError(null);
    } catch (caughtError) {
      setDatasetLoadError(caughtError instanceof Error ? caughtError.message : "Unable to load the selected dataset.");
    }
  }

  async function generateTidyverseScriptFromModal() {
    if (!configModalNode || configModalNode.kind !== "tidyverse-script" || !nodeConfigDraft) {
      return;
    }

    if (!tidyverseAiPrompt.trim()) {
      setTidyverseAiError("Enter a prompt to generate tidyverse code.");
      setTidyverseAiMessage(null);
      return;
    }

    if (!configModalTidyverseExecutionPlan || !("steps" in configModalTidyverseExecutionPlan)) {
      setTidyverseAiError(
        configModalTidyversePlanError ??
          "Connect this tidyverse step through a tidyverse-entry node so it can inherit the Source connection."
      );
      setTidyverseAiMessage(null);
      return;
    }

    if (!configModalTidyverseExecutionPlan.sourceConnectionId) {
      setTidyverseAiError("Select a Source node connection before generating tidyverse code.");
      setTidyverseAiMessage(null);
      return;
    }

    try {
      const updates = getNodeConfigurationUpdates();

      if (!updates) {
        setTidyverseAiMessage(null);
        return;
      }

      setTidyverseGeneratePending(true);
      setTidyverseAiError(null);
      setTidyverseAiMessage(null);
      setTidyverseGenerationPrompt("");
      setTidyverseProviderModel(null);

      const payload = parsePayload();
      const response = await fetch("/api/transform-studio/r-console/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          provider: rConsoleProvider,
          userPrompt: tidyverseAiPrompt,
          dataset: sharedDataset ?? null,
          payload,
          sourceConnectionId: configModalTidyverseExecutionPlan.sourceConnectionId,
          sourceSchema: configModalTidyverseGatewaySchema,
          sourceDataDictionary: configModalTidyverseGatewayDataDictionary,
          currentScript: updates.script ?? nodeConfigDraft.script
        })
      });
      const body = (await response.json().catch(() => null)) as
        | {
            error?: string;
            script?: string;
            generationPrompt?: string;
            providerModel?: string;
          }
        | null;

      if (!response.ok || !body?.script) {
        throw new Error(body?.error ?? "Unable to generate tidyverse code.");
      }

      setNodeConfigDraft((current) => (current ? { ...current, script: body.script ?? current.script } : current));
      setTidyverseGenerationPrompt(body.generationPrompt ?? "");
      setTidyverseProviderModel(body.providerModel ?? null);
      setTidyverseAiMessage("AI generated tidyverse code from the upstream gateway connection.");
    } catch (caughtError) {
      setTidyverseAiError(caughtError instanceof Error ? caughtError.message : "Unable to generate tidyverse code.");
      setTidyverseAiMessage(null);
    } finally {
      setTidyverseGeneratePending(false);
    }
  }

  async function runRConsole() {
    try {
      setRConsolePending(true);
      setRConsoleError(null);
      setRConsoleMessage(null);

      const payload = parsePayload();
      const response = await fetch("/api/transform-studio/r-console", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          script: rConsoleScript,
          dataset: sharedDataset ?? null,
          payload,
          sourceConnectionId: workflowSourceId || null
        })
      });
      const body = (await response.json().catch(() => null)) as (PluginExecutionResult & { error?: string }) | null;

      if (!response.ok || !body) {
        throw new Error(body?.error ?? "Unable to execute the R console.");
      }

      setRConsoleResult(body);
      setRConsoleMessage(body.summary || "R console executed.");
    } catch (caughtError) {
      setRConsoleError(caughtError instanceof Error ? caughtError.message : "Unable to execute the R console.");
      setRConsoleMessage(null);
    } finally {
      setRConsolePending(false);
    }
  }

  async function saveWorkflowToLibrary() {
    const name = workflowNameDraft.trim();

    if (!name) {
      setWorkflowSaveError("Workflow name is required.");
      return;
    }

    setSavingWorkflow(true);
    setWorkflowSaveError(null);

    try {
      const response = await fetch("/api/transform-studio/workflows", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          workflowId: activeWorkflowId ?? undefined,
          name,
          definition: serializeWorkflowDefinition()
        })
      });
      const body = (await response.json().catch(() => null)) as
        | {
            error?: string;
            workflow?: SavedWorkflowSummary;
          }
        | null;

      if (!response.ok || !body?.workflow) {
        throw new Error(body?.error ?? "Unable to save the workflow.");
      }

      const savedWorkflow = body.workflow;
      setActiveWorkflowId(body.workflow.id);
      setActiveWorkflowName(body.workflow.name);
      setSavedWorkflows((current) => {
        const next = [savedWorkflow, ...current.filter((workflow) => workflow.id !== savedWorkflow.id)];
        return next.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      });
      setShowWorkflowSaveModal(false);
      setMessage(activeWorkflowId ? `Workflow "${savedWorkflow.name}" updated.` : `Workflow "${savedWorkflow.name}" saved.`);
      setError(null);
    } catch (caughtError) {
      setWorkflowSaveError(caughtError instanceof Error ? caughtError.message : "Unable to save the workflow.");
    } finally {
      setSavingWorkflow(false);
    }
  }

  async function loadSavedWorkflow(workflowId: string) {
    setLoadingWorkflowId(workflowId);
    setWorkflowLibraryError(null);

    try {
      const response = await fetch(`/api/transform-studio/workflows/${workflowId}`, {
        cache: "no-store"
      });
      const body = (await response.json().catch(() => null)) as
        | {
            error?: string;
            workflow?: SavedWorkflowRecord;
          }
        | null;

      if (!response.ok || !body?.workflow) {
        throw new Error(body?.error ?? "Unable to load the saved workflow.");
      }

      applyWorkflowDefinition(body.workflow.definition, {
        workflowId: body.workflow.id,
        workflowName: body.workflow.name,
        successMessage: `Loaded "${body.workflow.name}".`
      });
      setShowWorkflowLibraryModal(false);
    } catch (caughtError) {
      setWorkflowLibraryError(caughtError instanceof Error ? caughtError.message : "Unable to load the saved workflow.");
    } finally {
      setLoadingWorkflowId(null);
    }
  }

  function loadSampleWorkflow() {
    applyWorkflowDefinition(sampleTidyverseWorkflow.definition, {
      workflowId: null,
      workflowName: sampleTidyverseWorkflow.name,
      bindFirstAccessibleSources: true,
      successMessage: `Loaded sample workflow "${sampleTidyverseWorkflow.name}".`
    });
    setShowWorkflowLibraryModal(false);
  }

  async function generateResultViewer() {
    if (!lastExecutedNode || !lastExecutedNodeResult) {
      setResultViewerError("Run a workflow node first so the viewer has output to preview.");
      return;
    }

    setResultViewerPending(true);
    setResultViewerError(null);

    try {
      const response = await fetch("/api/plugins/result-viewer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          nodeId: lastExecutedNode.id,
          nodeLabel: lastExecutedNode.label,
          result: lastExecutedNodeResult
        })
      });
        const body = (await response.json().catch(() => null)) as
        | {
            error?: string;
            preview?: ResultViewerPreview;
            provider?: PluginProviderId;
            model?: string;
          }
        | null;

        if (!response.ok || !body?.preview || !body?.provider || !body?.model) {
          throw new Error(body?.error ?? "Unable to generate an AI visualization for the last executed node.");
        }

      setResultViewer({
        nodeId: lastExecutedNode.id,
        nodeLabel: lastExecutedNode.label,
        result: lastExecutedNodeResult,
        preview: body.preview,
        provider: body.provider,
        model: body.model
      });
      setResultViewerMode(body.preview.preferredView === "visual" && body.preview.visual ? "visual" : "table");
      setShowResultViewerDrawer(true);
    } catch (caughtError) {
      setResultViewerError(caughtError instanceof Error ? caughtError.message : "Unable to generate an AI visualization for the last executed node.");
    } finally {
      setResultViewerPending(false);
    }
  }

  return (
    <div className="relative h-full overflow-hidden bg-slate-950/15">
      <div
        ref={canvasRef}
        className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.16)_1px,transparent_0)] [background-size:24px_24px]"
        onClick={() => {
          setSelectedEdgeId(null);
          setPendingConnectionFrom(null);
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/15 to-slate-950/35" />
        <div
          className="absolute inset-0 overflow-visible"
          style={{
            transform: `translate(${viewTransform.offsetX}px, ${viewTransform.offsetY}px) scale(${viewTransform.scale})`,
            transformOrigin: "top left"
          }}
        >
          <svg className="absolute inset-0 h-full w-full overflow-visible">
            {edges.map((edge) => {
              const fromNode = displayNodes.find((node) => node.id === edge.from);
              const toNode = displayNodes.find((node) => node.id === edge.to);

              if (!fromNode || !toNode) {
                return null;
              }

              const start = getPortPosition(fromNode, "output", nodeHeights);
              const end = getPortPosition(toNode, "input", nodeHeights);
              const curve = Math.max(56, Math.abs(end.x - start.x) / 2);
              const isSelected = edge.id === selectedEdgeId;
              const midX = (start.x + end.x) / 2;
              const midY = (start.y + end.y) / 2;

              return (
                <g key={edge.id}>
                  <path
                    d={`M ${start.x} ${start.y} C ${start.x + curve} ${start.y}, ${end.x - curve} ${end.y}, ${end.x} ${end.y}`}
                    fill="none"
                    pointerEvents="none"
                    stroke={isSelected ? "rgba(191,219,254,0.98)" : "rgba(56,189,248,0.84)"}
                    strokeWidth={isSelected ? 3.5 : 2.5}
                  />
                  <path
                    d={`M ${start.x} ${start.y} C ${start.x + curve} ${start.y}, ${end.x - curve} ${end.y}, ${end.x} ${end.y}`}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="16"
                    style={{ cursor: "pointer" }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedEdgeId(edge.id);
                      setPendingConnectionFrom(null);
                    }}
                  />
                  {isSelected ? (
                    <g
                      style={{ cursor: "pointer" }}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeEdge(edge.id);
                      }}
                    >
                      <circle cx={midX} cy={midY} fill="rgba(15,23,42,0.96)" r="9" stroke="rgba(248,250,252,0.9)" strokeWidth="1.5" />
                      <path d={`M ${midX - 3} ${midY - 3} L ${midX + 3} ${midY + 3} M ${midX + 3} ${midY - 3} L ${midX - 3} ${midY + 3}`} stroke="rgba(248,113,113,0.95)" strokeLinecap="round" strokeWidth="1.5" />
                    </g>
                  ) : null}
                </g>
              );
            })}
          </svg>

          {displayNodes.map((node) => {
            const isSelected = node.id === selectedNodeId;
            const canInput = node.kind !== "source";
            const canOutput = node.kind !== "result";
            const canDelete = node.kind !== "source" && node.kind !== "result";
            const canDisable = node.kind !== "source" && node.kind !== "result";
            const canRun = !executionPending && (node.kind === "source" || node.kind === "result" ? true : !node.disabled);
            const isRunning = runningNodeId === node.id || (runPending && (node.kind === "source" || node.kind === "result"));
            const configuredParams =
              node.kind === "plugin" && node.pluginId
                ? Object.entries(materializePluginParams(pluginInputFieldMap.get(node.pluginId) ?? [], node.params)).slice(0, 2)
                : node.kind === "tidyverse-script"
                  ? Object.entries(node.params ?? {}).slice(0, 2)
                  : [];
            const sourceNodeDetails = node.kind === "source" ? sourceDatasetSummary : null;
            const sourceConnectionDetails = node.kind === "source" ? workflowSource : null;
            const tidyverseSource = node.kind === "tidyverse-entry" ? workflowSource : null;
            const viewerSourceNodeId = node.kind === "tidyverse-viewer" ? getViewerSourceNodeId(node.id, nodes, edges) : null;
            const viewerSourceNode = viewerSourceNodeId ? displayNodes.find((entry) => entry.id === viewerSourceNodeId) ?? null : null;
            const kindBadge =
              node.kind === "source"
                ? "source"
                : node.kind === "result"
                  ? "result"
                  : node.kind === "plugin"
                    ? "js"
                    : node.kind === "tidyverse-entry"
                      ? "entry"
                      : node.kind === "tidyverse-viewer"
                        ? "view"
                        : "R";

            return (
              <div
                key={node.id}
                className={`absolute flex min-h-[108px] flex-col overflow-hidden rounded-[10px] border bg-slate-950/92 shadow-[0_16px_36px_rgba(15,23,42,0.38)] backdrop-blur-xl ${
                  isSelected ? "border-sky-300/55 ring-1 ring-sky-300/25" : "border-white/10"
                } ${
                  node.disabled ? "opacity-70" : ""
                }`}
                data-node-id={node.id}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedNodeId(node.id);
                  setSelectedEdgeId(null);
                }}
                ref={(element) => registerNodeElement(node.id, element)}
                style={{
                  left: node.x,
                  top: node.y,
                  width: nodeWidth
                }}
              >
                {canInput ? (
                  <button
                    className="absolute -left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-white/15 bg-slate-900 transition hover:border-sky-300 hover:bg-sky-400/30"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedEdgeId(null);
                      if (pendingConnectionFrom) {
                        connectNodes(pendingConnectionFrom, node.id);
                      }
                    }}
                    type="button"
                  />
                ) : null}
                {canOutput ? (
                  <button
                    className={`absolute -right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border transition ${
                      pendingConnectionFrom === node.id
                        ? "border-sky-100 bg-sky-400"
                        : "border-white/15 bg-slate-900 hover:border-sky-300 hover:bg-sky-400/30"
                    }`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedEdgeId(null);
                      setPendingConnectionFrom((current) => (current === node.id ? null : node.id));
                    }}
                    type="button"
                  />
                ) : null}
                <div
                  className={`flex cursor-move items-start justify-between gap-2 border-b border-white/10 px-2 py-1.5 ${
                    node.kind === "plugin"
                      ? "bg-sky-500/8"
                      : node.kind === "tidyverse-entry"
                        ? "bg-violet-500/10"
                        : node.kind === "tidyverse-script"
                          ? "bg-emerald-500/10"
                          : "bg-white/5"
                  }`}
                  onPointerDown={(event) => beginDrag(node.id, event)}
                >
                  <div className="min-w-0">
                    <div className="group relative inline-flex max-w-full">
                      <div className="pointer-events-none absolute left-0 top-full z-10 mt-2 w-max max-w-xs rounded-md border border-white/15 bg-slate-950/95 px-2 py-1 text-xs leading-tight text-slate-200 opacity-0 shadow-lg shadow-slate-950/40 transition-opacity duration-150 group-hover:opacity-100">
                        {node.description}
                      </div>
                      <button
                        className={`break-words text-left text-sm font-semibold leading-5 text-white transition hover:text-sky-200 ${
                          node.disabled ? "line-through decoration-white/50" : ""
                        }`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openNodeConfiguration(node.id);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        type="button"
                      >
                        {node.label}
                      </button>
                    </div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{node.kind}</p>
                  </div>
                  <Badge className={compactBadgeClassName}>{kindBadge}</Badge>
                </div>
                <div className="flex-1 px-2 py-1.5">
                  {sourceNodeDetails ? (
                    <div className="space-y-0.5 text-[11px] text-slate-400">
                      <p className="break-words" title={sourceNodeDetails.label}>{sourceNodeDetails.label}</p>
                      <p>{sourceNodeDetails.metrics}</p>
                    </div>
                  ) : null}
                  {sourceConnectionDetails ? (
                    <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-400">
                      <p className="break-words" title={sourceConnectionDetails.name}>{sourceConnectionDetails.name}</p>
                      <p>
                        {sourceConnectionDetails.sourceKind === "persistent-import"
                          ? `Workflow connection · Persistent import${sourceConnectionDetails.tableName ? ` · ${sourceConnectionDetails.tableName}` : ""}`
                          : `Workflow connection · ${sourceConnectionDetails.type}`}
                      </p>
                    </div>
                  ) : null}
                  {node.kind === "plugin" && node.pluginId ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge className={compactBadgeClassName}>{pluginMap.get(node.pluginId)?.runtime ?? "plugin"}</Badge>
                      {workflowSource ? <Badge className={compactBadgeClassName}>source ctx</Badge> : null}
                      {node.disabled ? <Badge className={compactBadgeClassName}>disabled</Badge> : null}
                    </div>
                  ) : null}
                  {node.kind === "tidyverse-entry" ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge className={compactBadgeClassName}>server</Badge>
                      <Badge className={compactBadgeClassName}>{tidyverseSource?.type ?? "select source"}</Badge>
                    </div>
                  ) : null}
                  {node.kind === "tidyverse-script" ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge className={compactBadgeClassName}>tidyverse</Badge>
                      <Badge className={compactBadgeClassName}>server</Badge>
                      {node.disabled ? <Badge className={compactBadgeClassName}>disabled</Badge> : null}
                    </div>
                  ) : null}
                  {node.kind === "tidyverse-viewer" ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge className={compactBadgeClassName}>viewer</Badge>
                      {viewerSourceNode ? <Badge className={compactBadgeClassName}>wired</Badge> : null}
                    </div>
                  ) : null}
                  {configuredParams.length > 0 ? (
                    <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-400">
                      {configuredParams.map(([key, value]) => (
                        <p key={`${node.id}-${key}`} className="break-words" title={`${key}: ${String(value)}`}>
                          {`${key}: ${String(value)}`}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {node.kind === "tidyverse-entry" ? (
                    <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-400">
                      <p className="break-words" title={tidyverseSource?.name ?? "No workflow connection selected"}>
                        {tidyverseSource?.name ?? "Choose a Source node connection"}
                      </p>
                    </div>
                  ) : null}
                  {node.kind === "tidyverse-viewer" ? (
                    <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-400">
                      <p className="break-words" title={viewerSourceNode?.label ?? "No upstream result selected"}>
                        {viewerSourceNode ? `Inspects ${viewerSourceNode.label}` : "Connect to a tidyverse result"}
                      </p>
                    </div>
                  ) : null}
                </div>
                {node.kind !== "source" && node.kind !== "result" ? (
                  <div className="mt-auto flex items-center gap-1 border-t border-white/10 bg-slate-950/70 px-2 py-1.5">
                    <button
                      className={`flex-1 rounded-none px-1.5 py-1 transition ${
                        canRun
                          ? "text-slate-400 hover:bg-emerald-400/10 hover:text-emerald-300"
                          : "cursor-not-allowed text-slate-600"
                      }`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void runNode(node);
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      disabled={!canRun}
                      title="Run node"
                      type="button"
                    >
                      {isRunning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      className={`flex-1 rounded-none px-1.5 py-1 transition ${
                        canDisable && !executionPending
                          ? node.disabled
                            ? "text-amber-300 hover:bg-amber-400/10 hover:text-amber-200"
                            : "text-slate-400 hover:bg-amber-400/10 hover:text-amber-300"
                          : "cursor-not-allowed text-slate-600"
                      }`}
                      disabled={!canDisable || executionPending}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleNodeDisabled(node.id);
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      title={node.disabled ? "Enable node" : "Disable node"}
                      type="button"
                    >
                      <Power className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className={`flex-1 rounded-none px-1.5 py-1 transition ${
                        canDelete && !executionPending
                          ? "text-slate-400 hover:bg-rose-400/10 hover:text-rose-300"
                          : "cursor-not-allowed text-slate-600"
                      }`}
                      disabled={!canDelete || executionPending}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeNode(node.id);
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      title="Delete node"
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute left-2 right-2 top-2 z-30 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 border border-white/10 bg-slate-950/82 px-2 py-1.5 shadow-[0_14px_30px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          <p className="text-xs font-semibold text-white">Transform Studio</p>
          <Badge className={compactBadgeClassName}>{activeWorkflowName ?? "Unsaved workflow"}</Badge>
          <Badge className={compactBadgeClassName}>{Math.round(viewTransform.scale * 100)}%</Badge>
          <Badge className={compactBadgeClassName}>{hasTidyverseNodes ? "Hybrid workflow" : "JS workflow"}</Badge>
          <Badge className={compactBadgeClassName}>
            {pendingConnectionFrom ? "Choose target input" : "Choose output to wire"}
          </Badge>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button className={compactButtonClassName} onClick={openSaveWorkflowModal} type="button" variant="outline">
            <Save className="mr-1 h-3.5 w-3.5" />
            Save workflow
          </Button>
          <Button className={compactButtonClassName} onClick={() => void openWorkflowLibraryModal()} type="button" variant="outline">
            <FolderOpen className="mr-1 h-3.5 w-3.5" />
            Load workflow
          </Button>
          <Button className={compactButtonClassName} onClick={loadSampleWorkflow} type="button" variant="outline">
            <DatabaseZap className="mr-1 h-3.5 w-3.5" />
            Load sample
          </Button>
          <Button className={compactButtonClassName} onClick={() => centerAndFitNodes(nodes)} type="button" variant="outline">
            <Focus className="mr-1 h-3.5 w-3.5" />
            Center & fit
          </Button>
          <Button className={compactButtonClassName} onClick={toggleAllBlocks} type="button" variant="outline">
            {allBlocksExpanded ? "Collapse all blocks" : "Expand all blocks"}
          </Button>
          <Button className={compactButtonClassName} onClick={() => setShowLeftPanel((current) => !current)} type="button" variant="outline">
            {showLeftPanel ? "Hide tools" : "Show tools"}
          </Button>
          <Button className={compactButtonClassName} onClick={() => setShowExecutionDrawer((current) => !current)} type="button" variant="outline">
            <Play className="mr-1 h-3.5 w-3.5" />
            {showExecutionDrawer ? "Hide execution" : "Show execution"}
          </Button>
          <Button className={compactButtonClassName} onClick={() => setShowRightPanel((current) => !current)} type="button" variant="outline">
            {showRightPanel ? "Hide details" : "Show details"}
          </Button>
          <Button className={compactButtonClassName} onClick={() => setShowResultViewerDrawer((current) => !current)} type="button" variant="outline">
            <BarChart3 className="mr-1 h-3.5 w-3.5" />
            {showResultViewerDrawer ? "Hide viewer" : "Show viewer"}
          </Button>
          <Button className={compactButtonClassName} onClick={() => setShowRConsoleDrawer((current) => !current)} type="button" variant="outline">
            <Code2 className="mr-1 h-3.5 w-3.5" />
            {showRConsoleDrawer ? "Hide R console" : "Show R console"}
          </Button>
          <Button className={compactButtonClassName} onClick={() => openTidyverseViewerWindow()} type="button" variant="outline">
            <FileSearch2 className="mr-1 h-3.5 w-3.5" />
            {showTidyverseViewerWindow && !tidyverseViewerWindowMinimized
              ? "Focus tidyverse viewer"
              : showTidyverseViewerWindow && tidyverseViewerWindowMinimized
                ? "Restore tidyverse viewer"
                : "Show tidyverse viewer"}
          </Button>
          <Button className={compactButtonClassName} onClick={() => setShowCreatorDrawer((current) => !current)} type="button" variant="outline">
            <Puzzle className="mr-1 h-3.5 w-3.5" />
            {showCreatorDrawer ? "Hide creator" : "Show creator"}
          </Button>
        </div>
      </div>

      {message || error ? (
        <div className="pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2">
          <div
            className={`min-w-[260px] max-w-[min(92vw,520px)] rounded-[12px] border px-4 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.34)] backdrop-blur-xl ${
              error
                ? "border-rose-400/35 bg-rose-950/85 text-rose-100"
                : "border-emerald-400/35 bg-emerald-950/85 text-emerald-100"
            }`}
          >
            <div className="flex items-center gap-2">
              <Badge className={compactBadgeClassName}>{error ? "Run failed" : "Run complete"}</Badge>
              <p className="text-sm">{error ?? message}</p>
            </div>
          </div>
        </div>
      ) : null}

      {showLeftPanel || showExecutionDrawer ? (
        <div className="absolute bottom-2 left-2 top-14 z-20 flex gap-2 overflow-visible">
          {showLeftPanel ? (
            <div className="flex w-[72px] flex-col gap-2 overflow-visible">
              <div className="flex flex-col gap-2 rounded-[14px] border border-white/10 bg-slate-950/82 p-2 shadow-[0_18px_40px_rgba(15,23,42,0.32)] backdrop-blur-xl">
                <div className="group relative">
                  <div className="pointer-events-none absolute left-full top-1/2 z-10 ml-2 w-56 -translate-y-1/2 rounded-md border border-white/15 bg-slate-950/95 px-2 py-1 text-xs leading-tight text-slate-200 opacity-0 shadow-lg shadow-slate-950/40 transition-opacity duration-150 group-hover:opacity-100">
                    Bridge the Source node workflow connection into downstream tidyverse nodes.
                  </div>
                  <Button
                    aria-label="Add Tidyverse entry node"
                    className="h-12 w-full rounded-[10px] px-0"
                    onClick={addTidyverseEntryNode}
                    title="Bridge the Source node workflow connection into downstream tidyverse nodes."
                    type="button"
                    variant="outline"
                  >
                    <DatabaseZap className="h-4 w-4 text-violet-300" />
                  </Button>
                </div>
                <div className="group relative">
                  <div className="pointer-events-none absolute left-full top-1/2 z-10 ml-2 w-56 -translate-y-1/2 rounded-md border border-white/15 bg-slate-950/95 px-2 py-1 text-xs leading-tight text-slate-200 opacity-0 shadow-lg shadow-slate-950/40 transition-opacity duration-150 group-hover:opacity-100">
                    Run R/tidyverse code with df_input, payload, params, upstream, connection, and db.
                  </div>
                  <Button
                    aria-label="Add Tidyverse step node"
                    className="h-12 w-full rounded-[10px] px-0"
                    onClick={addTidyverseScriptNode}
                    title="Run R/tidyverse code with df_input, payload, params, upstream, connection, and db."
                    type="button"
                    variant="outline"
                  >
                    <Code2 className="h-4 w-4 text-emerald-300" />
                  </Button>
                </div>
                <div className="group relative">
                  <div className="pointer-events-none absolute left-full top-1/2 z-10 ml-2 w-56 -translate-y-1/2 rounded-md border border-white/15 bg-slate-950/95 px-2 py-1 text-xs leading-tight text-slate-200 opacity-0 shadow-lg shadow-slate-950/40 transition-opacity duration-150 group-hover:opacity-100">
                    Open the floating tidyverse viewer window and inspect the latest tidyverse result.
                  </div>
                  <Button
                    aria-label="Open tidyverse viewer window"
                    className="h-12 w-full rounded-[10px] px-0"
                    onClick={() => openTidyverseViewerWindow()}
                    title="Open the floating tidyverse viewer window and inspect the latest tidyverse result."
                    type="button"
                    variant="outline"
                  >
                    <FileSearch2 className="h-4 w-4 text-amber-200" />
                  </Button>
                </div>
                <div className="group relative">
                  <div className="pointer-events-none absolute left-full top-1/2 z-10 ml-2 w-56 -translate-y-1/2 rounded-md border border-white/15 bg-slate-950/95 px-2 py-1 text-xs leading-tight text-slate-200 opacity-0 shadow-lg shadow-slate-950/40 transition-opacity duration-150 group-hover:opacity-100">
                    Open the plugin picker to choose a saved JavaScript node for this workflow.
                  </div>
                  <Button
                    aria-label="Open JavaScript node picker"
                    className="h-12 w-full rounded-[10px] px-0"
                    onClick={openPluginPicker}
                    title="Open the plugin picker to choose a saved JavaScript node for this workflow."
                    type="button"
                    variant="outline"
                  >
                    <Puzzle className="h-4 w-4 text-sky-300" />
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {showExecutionDrawer ? (
            <div className="flex w-[270px] shrink-0 flex-col overflow-hidden border border-white/10 bg-slate-950/82 shadow-[0_18px_40px_rgba(15,23,42,0.32)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
                <div>
                  <HoverSubtitleTitle
                    subtitle="Run the current node workflow against the shared dataset and any tidyverse connections."
                    title="Execution"
                  />
                </div>
                <Button className={compactButtonClassName} onClick={() => setShowExecutionDrawer(false)} type="button" variant="ghost">
                  Hide
                </Button>
              </div>
              <div className="flex-1 space-y-2 overflow-auto p-3 text-[11px]">
                <div className="border border-white/10 bg-slate-950/25 p-2">
                  <div className="group/current-dataset relative inline-flex max-w-full">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Current dataset</p>
                    <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 w-max max-w-xs -translate-x-1/2 rounded-md border border-white/15 bg-slate-950/95 px-2 py-1 text-xs leading-tight text-white opacity-0 shadow-lg shadow-slate-950/40 transition-opacity duration-150 group-hover/current-dataset:opacity-100">
                      {sharedDataset?.label ?? "No dataset loaded in Data Studio"}
                    </div>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {sharedDataset
                      ? `${sharedDataset.rowCount} rows · ${sharedDataset.columns.length} columns`
                      : "Load a dataset first, or use payload-only plugins."}
                  </p>
                </div>
                <div className="border border-white/10 bg-slate-950/25 p-2">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Workflow connection</p>
                  <p className="mt-1 text-[11px] text-slate-200">{workflowSource?.name ?? "No Source node connection selected"}</p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {workflowSource
                      ? workflowSource.sourceKind === "persistent-import"
                        ? `Persistent import${workflowSource.tableName ? ` · ${workflowSource.tableName}` : ""}`
                        : `${workflowSource.type} governed source`
                      : "Select a PostgreSQL, MySQL, or persistent import in the Source node to pass connection context downstream."}
                  </p>
                </div>
                <select
                  className="w-full rounded-none border border-white/10 bg-slate-950/50 px-2 py-1 text-[11px]"
                  onChange={(event) => setExecutionTarget(event.target.value as PluginExecutionTarget)}
                  value={executionTarget}
                >
                  <option disabled={hasTidyverseNodes} value="browser">
                    {hasTidyverseNodes ? "Run in browser (JS-only workflows)" : "Run in browser"}
                  </option>
                  <option value="server">Run on server</option>
                </select>
                {hasTidyverseNodes ? (
                  <p className="text-[10px] text-violet-300">
                    Tidyverse entry and R nodes automatically use server execution so governed connection secrets stay off the client.
                  </p>
                ) : null}
                {!hasTidyverseNodes && workflowSource ? (
                  <p className="text-[10px] text-violet-300">
                    Source connection context is resolved on the server so downstream JavaScript nodes can receive workflow connection variables safely.
                  </p>
                ) : null}
                <textarea
                  className="min-h-[88px] w-full rounded-none border border-white/10 bg-slate-950/40 px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-sky-400"
                  onChange={(event) => setPayloadText(event.target.value)}
                  placeholder='{"threshold": 10}'
                  value={payloadText}
                />
                <Button className={`w-full ${compactButtonClassName}`} disabled={executionPending} onClick={() => void runPipeline()} type="button">
                  <Play className="mr-1 h-3.5 w-3.5" />
                  {runPending ? "Running…" : "Run workflow"}
                </Button>
                <Button
                  className={`w-full ${compactButtonClassName}`}
                  disabled={resultViewerPending || !lastExecutedNodeResult}
                  onClick={() => void generateResultViewer()}
                  type="button"
                  variant="outline"
                >
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  {resultViewerPending ? "Generating visualizer…" : "Generate AI visualizer"}
                </Button>
                <Button className={`w-full ${compactButtonClassName}`} disabled={!execution?.finalDataset} onClick={publishResultDataset} type="button" variant="outline">
                  <ArrowRight className="mr-1 h-3.5 w-3.5" />
                  Publish to Data Studio
                </Button>
                {lastExecutedNode ? (
                  <div className="border border-white/10 bg-slate-950/25 p-2 text-[10px] text-slate-400">
                    Last executed node: <span className="text-slate-200">{lastExecutedNode.label}</span>
                  </div>
                ) : null}
                {resultViewerError ? <p className="text-xs text-rose-300">{resultViewerError}</p> : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {showRightPanel || showResultViewerDrawer || showRConsoleDrawer || showCreatorDrawer ? (
        <div className="absolute right-2 top-14 bottom-2 z-20 flex gap-2 overflow-hidden">
          {showRightPanel ? (
          <div className="flex w-[270px] flex-col gap-2 overflow-hidden">
          {selectedEdge ? (
            <Card className={`${compactCardClassName} min-h-0`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <HoverSubtitleTitle
                    subtitle="Click any wire on the canvas to select it, then unlink it here."
                    title="Selected link"
                  />
                </div>
                <Button className={compactButtonClassName} onClick={() => removeEdge(selectedEdge.id)} type="button" variant="ghost">
                  <Unlink2 className="mr-1 h-3.5 w-3.5" />
                  Unlink
                </Button>
              </div>
              <div className="mt-2 border border-white/10 bg-slate-950/25 p-2 text-[11px] text-slate-300">
                {(displayNodes.find((node) => node.id === selectedEdge.from)?.label ?? selectedEdge.from) +
                  " -> " +
                  (displayNodes.find((node) => node.id === selectedEdge.to)?.label ?? selectedEdge.to)}
              </div>
            </Card>
          ) : null}
          </div>
          ) : null}

          {showResultViewerDrawer ? (
            <div className="flex w-[420px] shrink-0 flex-col overflow-hidden border border-white/10 bg-slate-950/82 shadow-[0_18px_40px_rgba(15,23,42,0.32)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
                <div>
                  <HoverSubtitleTitle
                    subtitle="Use your personal AI provider key to recommend a chart from result metadata only, then render it locally from the node result."
                    title="AI visualizer"
                  />
                </div>
                <Button className={compactButtonClassName} onClick={() => setShowResultViewerDrawer(false)} type="button" variant="ghost">
                  Hide
                </Button>
              </div>
              <div className="flex-1 overflow-auto p-3">
                {resultViewer ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={compactBadgeClassName}>{resultViewer.nodeLabel}</Badge>
                      <Badge className={compactBadgeClassName}>{resultViewer.provider}</Badge>
                      <Badge className={compactBadgeClassName}>{resultViewer.model}</Badge>
                      <Badge className={compactBadgeClassName}>{resultViewer.preview.preferredView}</Badge>
                    </div>
                    <div className="border border-white/10 bg-slate-950/25 p-3">
                      <p className="text-sm font-medium text-white">{resultViewer.preview.title}</p>
                      <p className="mt-2 text-xs leading-relaxed text-slate-300">{resultViewer.preview.summary}</p>
                    </div>
                    <ResultPreviewViewer mode={resultViewerMode} onModeChange={setResultViewerMode} preview={resultViewer.preview} result={resultViewer.result} />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-400">
                      Run a workflow node, then generate an AI visualization recommendation from metadata only.
                    </p>
                    <Button
                      className={compactButtonClassName}
                      disabled={resultViewerPending || !lastExecutedNodeResult}
                      onClick={() => void generateResultViewer()}
                      type="button"
                    >
                      <Sparkles className="mr-1 h-3.5 w-3.5" />
                      {resultViewerPending ? "Generating visualizer…" : "Generate AI visualizer"}
                    </Button>
                  </div>
                )}
                {resultViewer && resultViewer.preview.visual ? (
                  <div className="mt-3 border border-white/10 bg-slate-950/25 p-2 text-[10px] text-slate-400">
                    Use <Table2 className="mr-1 inline h-3 w-3" /> Table at any time to inspect the same preview as rows.
                  </div>
                ) : null}
                {resultViewerError ? <p className="mt-3 text-xs text-rose-300">{resultViewerError}</p> : null}
              </div>
            </div>
          ) : null}

          {showRConsoleDrawer ? (
            <div className="flex w-[420px] shrink-0 flex-col overflow-hidden border border-white/10 bg-slate-950/82 shadow-[0_18px_40px_rgba(15,23,42,0.32)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
                <div>
                  <HoverSubtitleTitle
                    subtitle="Run plain R code against the same workflow connection that tidyverse-entry forwards downstream."
                    title="R console"
                  />
                </div>
                <Button className={compactButtonClassName} onClick={() => setShowRConsoleDrawer(false)} type="button" variant="ghost">
                  Hide
                </Button>
              </div>
              <div className="flex-1 space-y-3 overflow-auto p-3">
                <div className="rounded-[12px] border border-white/10 bg-slate-950/25 p-3 text-sm text-slate-300">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Gateway connection</p>
                  <p className="mt-2 text-white">{workflowSource?.name ?? "No Source node connection selected."}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {workflowSource
                      ? workflowSource.sourceKind === "persistent-import"
                        ? `Shared with tidyverse-entry · Persistent import${workflowSource.tableName ? ` · ${workflowSource.tableName}` : ""}`
                        : `Shared with tidyverse-entry · ${workflowSource.type} governed source`
                      : "Configure the Source node to give this console the same connection that tidyverse-entry passes to tidyverse scripts."}
                  </p>
                  {primaryTidyverseGatewaySchema ? (
                    <p className="mt-1 text-xs text-emerald-300">
                      {primaryTidyverseGatewaySchema.scope === "table"
                        ? `Schema cached from tidyverse-entry: ${primaryTidyverseGatewaySchema.tables[0]?.name ?? "selected table"}`
                        : `Schema cached from tidyverse-entry: ${primaryTidyverseGatewaySchema.tables.length} tables available`}
                    </p>
                  ) : null}
                </div>

                <textarea
                  className="h-[240px] w-full rounded-[12px] border border-white/10 bg-slate-950/40 px-3 py-2 font-mono text-[12px] text-slate-100 outline-none focus:border-emerald-400"
                  onChange={(event) => setRConsoleScript(event.target.value)}
                  value={rConsoleScript}
                />

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    className={compactButtonClassName}
                    disabled={rConsolePending || !rConsoleScript.trim()}
                    onClick={() => void runRConsole()}
                    type="button"
                  >
                    <Play className="mr-1 h-3.5 w-3.5" />
                    {rConsolePending ? "Running…" : "Run R console"}
                  </Button>
                  {rConsoleResult ? <Badge className={compactBadgeClassName}>{rConsoleResult.status}</Badge> : null}
                </div>

                <div className="rounded-[12px] border border-white/10 bg-slate-950/25 p-3">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Console log</p>
                  {rConsoleResult?.logs && rConsoleResult.logs.length > 0 ? (
                    <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-300">
                      {rConsoleResult.logs.join("\n")}
                    </pre>
                  ) : (
                    <p className="mt-2 text-xs text-slate-400">Run the console to capture stdout, messages, warnings, and other R log output here.</p>
                  )}
                </div>

                {rConsoleResult ? (
                  <div className="rounded-[12px] border border-white/10 bg-slate-950/25 p-3 text-sm text-slate-300">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Summary</p>
                    <p className="mt-2">{rConsoleResult.summary}</p>
                  </div>
                ) : null}

                {rConsoleMessage ? <p className="text-xs text-emerald-300">{rConsoleMessage}</p> : null}
                {rConsoleError ? <p className="text-xs text-rose-300">{rConsoleError}</p> : null}
              </div>
            </div>
          ) : null}

          {showCreatorDrawer ? (
            <div className="flex w-[430px] shrink-0 flex-col overflow-hidden border border-white/10 bg-slate-950/82 shadow-[0_18px_40px_rgba(15,23,42,0.32)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
                <div>
                  <HoverSubtitleTitle
                    subtitle="Create and save JavaScript plugins here, then add them from the node catalog into the workflow."
                    title="JavaScript node creator"
                  />
                </div>
                <Button className={compactButtonClassName} onClick={() => setShowCreatorDrawer(false)} type="button" variant="ghost">
                  Hide
                </Button>
              </div>
              <div className="flex-1 overflow-auto p-2">
                <PluginStudioPanel
                  dataset={sharedDataset}
                  editorPlugin={editorPlugin}
                  onPluginsChanged={() => void loadPlugins()}
                  role={role}
                  showChainRunner={false}
                  showSavedPlugins={false}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {showTidyverseViewerWindow ? (
        <div className="pointer-events-none absolute inset-0 z-30">
          <DesktopWindow
            frame={tidyverseViewerWindowFrame}
            isFocused
            isMaximized={tidyverseViewerWindowMaximized}
            isMinimized={tidyverseViewerWindowMinimized}
            onClose={() => {
              setShowTidyverseViewerWindow(false);
              setTidyverseViewerWindowMinimized(false);
            }}
            onFocus={() => undefined}
            onFrameChange={setTidyverseViewerWindowFrame}
            onMinimize={() => setTidyverseViewerWindowMinimized(true)}
            onToggleMaximize={() => setTidyverseViewerWindowMaximized((current) => !current)}
            subtitle={activeViewerNode ? `Auto-linked to ${activeViewerNode.label}` : "Waiting for a tidyverse run"}
            title="Tidyverse Viewer"
          >
            <div className="flex h-full min-h-0 bg-slate-950/80">
                <aside className="flex w-[320px] shrink-0 flex-col gap-3 overflow-auto border-r border-white/10 bg-slate-950/70 p-4">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Result source</p>
                    <select
                      className="w-full rounded-[10px] border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                      onChange={(event) => setSelectedViewerNodeId(event.target.value)}
                      value={activeViewerNodeId}
                    >
                      {tidyverseViewerCandidateNodes.length > 0 ? (
                        tidyverseViewerCandidateNodes.map((node) => (
                          <option key={node.id} value={node.id}>
                            {node.label}
                          </option>
                        ))
                      ) : (
                        <option value="">No tidyverse result available</option>
                      )}
                    </select>
                    <p className="text-xs text-slate-400">
                      The viewer automatically follows the last tidyverse node you ran. You can switch to any prior tidyverse result here.
                    </p>
                  </div>

                  <div className="rounded-[10px] border border-white/10 bg-slate-950/35 p-3 text-sm text-slate-300">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-white">{activeViewerNode?.label ?? "No tidyverse node selected"}</p>
                      {activeViewerResult ? <Badge className={compactBadgeClassName}>{activeViewerResult.status}</Badge> : null}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">
                      {activeViewerResult?.summary ?? "Run any tidyverse-script node to stream its output into the floating viewer window."}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Viewer object</p>
                    <select
                      className="w-full rounded-[10px] border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                      disabled={activeViewerObjects.length === 0}
                      onChange={(event) => setSelectedViewerObjectKey(event.target.value)}
                      value={activeViewerObject?.key ?? ""}
                    >
                      {activeViewerObjects.length > 0 ? (
                        activeViewerObjects.map((item) => (
                          <option key={item.key} value={item.key}>
                            {item.label}
                          </option>
                        ))
                      ) : (
                        <option value="">No inspectable objects</option>
                      )}
                    </select>
                    <p className="text-xs text-slate-400">
                      Tables render in the preview pane. Lists and nested objects render as an expandable tree-style structure.
                    </p>
                  </div>

                  <div className="rounded-[10px] border border-white/10 bg-slate-950/35 p-3">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Console output</p>
                    {activeViewerResult?.logs && activeViewerResult.logs.length > 0 ? (
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-300">
                        {activeViewerResult.logs.join("\n")}
                      </pre>
                    ) : (
                      <p className="mt-2 text-xs text-slate-400">No tidyverse console output is available for this result yet.</p>
                    )}
                  </div>
                </aside>

                <main className="flex min-w-0 flex-1 flex-col overflow-auto p-4">
                  {activeViewerObject ? (
                    <div className="flex min-h-0 flex-1 flex-col rounded-[12px] border border-white/10 bg-slate-950/45 p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-lg font-semibold text-white">{activeViewerObject.label}</p>
                          <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{activeViewerObject.kind}</p>
                        </div>
                        {activeViewerObject.kind === "table" ? (
                          <Button
                            className={compactButtonClassName}
                            onClick={() => downloadViewerNodeAsCsv(activeViewerObject)}
                            type="button"
                            variant="outline"
                          >
                            <Download className="mr-1 h-3.5 w-3.5" />
                            Download CSV
                          </Button>
                        ) : null}
                      </div>
                      <div className="min-h-0 flex-1 overflow-auto">
                        <TidyverseResultPreview node={activeViewerObject} />
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-[12px] border border-dashed border-white/10 bg-slate-950/35 p-6 text-sm text-slate-400">
                      Run a tidyverse-script node to populate the viewer, then inspect its objects here.
                    </div>
                  )}
                </main>
            </div>
          </DesktopWindow>
          {tidyverseViewerWindowMinimized ? (
            <button
              className="pointer-events-auto absolute bottom-3 right-3 flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/90 px-3 py-2 text-sm text-slate-100 shadow-[0_16px_40px_rgba(15,23,42,0.45)] backdrop-blur-xl transition hover:border-sky-300/40 hover:bg-slate-900"
              onClick={() => setTidyverseViewerWindowMinimized(false)}
              type="button"
            >
              <FileSearch2 className="h-4 w-4 text-amber-200" />
              <span>Tidyverse Viewer</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {showWorkflowSaveModal ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm"
          onClick={() => setShowWorkflowSaveModal(false)}
        >
          <div
            className="max-h-[min(90vh,1500px)] w-full max-w-lg overflow-hidden rounded-[20px] border border-white/10 bg-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.55)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Workflow library</p>
                <h2 className="mt-1 text-lg font-semibold text-white">{activeWorkflowId ? "Update workflow" : "Save workflow"}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Store the current Transform Studio graph so it can be loaded again later.
                </p>
              </div>
              <Button className={compactButtonClassName} onClick={() => setShowWorkflowSaveModal(false)} type="button" variant="ghost">
                <X className="mr-1 h-3.5 w-3.5" />
                Close
              </Button>
            </div>

            <div className="max-h-[calc(min(90vh,1500px)-140px)] space-y-4 overflow-auto px-5 py-4">
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Workflow name</span>
                <Input
                  className="rounded-[10px] px-3 py-2 text-sm"
                  onChange={(event) => setWorkflowNameDraft(event.target.value)}
                  placeholder="Quarterly source preview"
                  value={workflowNameDraft}
                />
              </label>
              <div className="rounded-[12px] border border-white/10 bg-slate-950/35 px-3 py-3 text-sm text-slate-300">
                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Current graph</p>
                <p className="mt-2">{chainSummary}</p>
              </div>
              {workflowSaveError ? <p className="text-sm text-rose-300">{workflowSaveError}</p> : null}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-white/10 px-5 py-4">
              <Button onClick={() => setShowWorkflowSaveModal(false)} type="button" variant="outline">
                Cancel
              </Button>
              <Button disabled={savingWorkflow} onClick={() => void saveWorkflowToLibrary()} type="button">
                <Save className="mr-1 h-3.5 w-3.5" />
                {savingWorkflow ? "Saving…" : activeWorkflowId ? "Update workflow" : "Save workflow"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showWorkflowLibraryModal ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm"
          onClick={() => setShowWorkflowLibraryModal(false)}
        >
          <div
            className="max-h-[min(90vh,1500px)] w-full max-w-3xl overflow-hidden rounded-[20px] border border-white/10 bg-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.55)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Workflow library</p>
                <h2 className="mt-1 text-lg font-semibold text-white">Load a saved workflow</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Restore a saved Transform Studio graph or start from the built-in tidyverse preview sample.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button className={compactButtonClassName} onClick={() => void loadSavedWorkflows()} type="button" variant="ghost">
                  <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loadingSavedWorkflows ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button className={compactButtonClassName} onClick={() => setShowWorkflowLibraryModal(false)} type="button" variant="ghost">
                  <X className="mr-1 h-3.5 w-3.5" />
                  Close
                </Button>
              </div>
            </div>

            <div className="max-h-[calc(min(90vh,1500px)-92px)] space-y-5 overflow-auto px-5 py-4">
              <div className="rounded-[14px] border border-white/10 bg-slate-950/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{sampleTidyverseWorkflow.name}</p>
                    <p className="mt-1 text-sm text-slate-400">{sampleTidyverseWorkflow.description}</p>
                  </div>
                  <Button onClick={loadSampleWorkflow} type="button">
                    <DatabaseZap className="mr-1 h-3.5 w-3.5" />
                    Load sample
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Saved workflows</p>
                </div>
                {loadingSavedWorkflows ? (
                  <p className="text-sm text-slate-400">Loading saved workflows…</p>
                ) : savedWorkflows.length === 0 ? (
                  <div className="rounded-[14px] border border-dashed border-white/10 bg-slate-950/25 p-4 text-sm text-slate-400">
                    No saved workflows yet. Save the current graph to create one.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {savedWorkflows.map((workflow) => (
                      <div key={workflow.id} className="rounded-[14px] border border-white/10 bg-slate-950/30 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-white">{workflow.name}</p>
                            <p className="mt-1 text-xs text-slate-400">
                              Updated {new Date(workflow.updatedAt).toLocaleString()}
                            </p>
                          </div>
                          <Button
                            disabled={loadingWorkflowId === workflow.id}
                            onClick={() => void loadSavedWorkflow(workflow.id)}
                            type="button"
                          >
                            <FolderOpen className="mr-1 h-3.5 w-3.5" />
                            {loadingWorkflowId === workflow.id ? "Loading…" : "Load workflow"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {workflowLibraryError ? <p className="text-sm text-rose-300">{workflowLibraryError}</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {configModalNode && configModalDisplayNode && nodeConfigDraft ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm"
          onClick={() => setConfigModalNodeId(null)}
        >
          <div
            className="max-h-[min(90vh,1500px)] w-full max-w-2xl overflow-hidden rounded-[20px] border border-white/10 bg-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.55)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Node configuration</p>
                <HoverHelperLabel
                  as="h2"
                  helper={`Update this ${configModalDisplayNode.kind} node here. Node titles on the canvas open the same editor.`}
                  label={configModalDisplayNode.label}
                  labelClassName="mt-1 text-lg font-semibold text-white"
                  tooltipClassName="text-sm"
                  wrapperClassName="mt-1"
                />
              </div>
              <Button className={compactButtonClassName} onClick={() => setConfigModalNodeId(null)} type="button" variant="ghost">
                <X className="mr-1 h-3.5 w-3.5" />
                Close
              </Button>
            </div>

            <div className="max-h-[calc(min(90vh,1500px)-140px)] space-y-4 overflow-auto px-5 py-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Node title</span>
                  <Input
                    className="rounded-[10px] px-3 py-2 text-sm"
                    onChange={(event) =>
                      setNodeConfigDraft((current) => (current ? { ...current, label: event.target.value } : current))
                    }
                    value={nodeConfigDraft.label}
                  />
                </label>
                <div className="rounded-[10px] border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-300">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Node type</p>
                  <p className="mt-1">{configModalDisplayNode.kind}</p>
                </div>
              </div>

              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Description</span>
                <textarea
                  className={
                    configModalNode.kind === "tidyverse-script"
                      ? "min-h-[56px] w-full rounded-[10px] border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400"
                      : modalTextAreaClassName
                  }
                  onChange={(event) =>
                    setNodeConfigDraft((current) => (current ? { ...current, description: event.target.value } : current))
                  }
                  value={nodeConfigDraft.description}
                />
              </label>

              {configModalNode.kind === "plugin" ? (
                <div className="space-y-3 rounded-[14px] border border-white/10 bg-slate-950/30 p-4">
                  <HoverSubtitleTitle
                    subtitle="Plugin workflow inputs come from plugin.inputForm and are saved onto this node."
                    title="Workflow inputs"
                  />
                  <PluginHtmlInputForm
                    emptyMessage="This plugin does not expose workflow inputs."
                    inputForm={configModalManifest?.inputForm}
                    onChange={(name, value) =>
                      setNodeConfigDraft((current) =>
                        current
                          ? {
                              ...current,
                              params: {
                                ...current.params,
                                [name]: value
                              }
                            }
                          : current
                      )
                    }
                    values={configModalInputValues}
                  />
                </div>
              ) : null}

              {configModalNode.kind === "tidyverse-entry" ? (
                <div className="space-y-3 rounded-[14px] border border-white/10 bg-slate-950/30 p-4">
                  <HoverSubtitleTitle
                    subtitle="This gateway forwards the Source connection into downstream nodes. Tidyverse scripts stay lazy and only open DBI access when they execute."
                    title="Source connection gateway"
                  />
                  <div className="rounded-[10px] border border-white/10 bg-slate-950/35 p-3 text-sm text-slate-300">
                    <p>{workflowSource?.name ?? "No Source node connection selected yet."}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {workflowSource
                        ? workflowSource.sourceKind === "persistent-import"
                          ? `Persistent import · ${workflowSource.tableName}`
                          : `${workflowSource.type} · ${workflowSource.owner}`
                        : "Open the Source node modal to choose the PostgreSQL, MySQL, or persistent import connection for this workflow."}
                    </p>
                  </div>
                </div>
              ) : null}

              {configModalNode.kind === "tidyverse-script" ? (
                <div className="space-y-3 rounded-[14px] border border-white/10 bg-slate-950/30 p-4">
                  <HoverSubtitleTitle
                    subtitle="Available variables: df_input, payload, params, upstream, connection, db, source_tbl, get_source_tbl(), result, result_dataset, log_message(...)."
                    title="R script and params"
                  />
                  <div className="space-y-3 rounded-[10px] border border-white/10 bg-slate-950/35 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <HoverSubtitleTitle
                          subtitle="Generate tidyverse code against the Source connection forwarded by the upstream tidyverse-entry node. Use the provided db/connection handle directly and keep database access lazy."
                          title="AI tidyverse generator"
                        />
                        <p className="mt-1 text-[11px] text-slate-400">
                          {sharedDataset
                            ? `${sharedDataset.columns.length} columns · ${sharedDataset.rowCount} rows available for schema-aware generation.`
                            : "Generation can use workflow connection metadata even when no dataset is currently loaded."}
                        </p>
                      </div>
                      <select
                        className="rounded-[10px] border border-white/10 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-400"
                        onChange={(event) => setRConsoleProvider(event.target.value as PluginProviderId)}
                        value={rConsoleProvider}
                      >
                        {pluginProviderOptions.map((provider) => (
                          <option key={provider} value={provider}>
                            {provider === "copilot" ? "GitHub Copilot / Models" : provider === "gemini" ? "Gemini" : "Mistral"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="rounded-[10px] border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-300">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Gateway connection</p>
                      {configModalTidyversePlanError ? (
                        <p className="mt-2 text-amber-300">{configModalTidyversePlanError}</p>
                      ) : configModalTidyverseGatewaySource ? (
                        <>
                          <p className="mt-2 break-words text-white">{configModalTidyverseGatewaySource.name}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {configModalTidyverseGatewaySource.sourceKind === "persistent-import"
                              ? `Forwarded via ${configModalTidyverseGatewayNode?.label ?? "tidyverse-entry"} · Persistent import${configModalTidyverseGatewaySource.tableName ? ` · ${configModalTidyverseGatewaySource.tableName}` : ""}`
                              : `Forwarded via ${configModalTidyverseGatewayNode?.label ?? "tidyverse-entry"} · ${configModalTidyverseGatewaySource.type} governed source`}
                          </p>
                          {configModalTidyverseGatewaySchema ? (
                            <p className="mt-1 text-xs text-emerald-300">
                              {configModalTidyverseGatewaySchema.scope === "table"
                                ? `Schema loaded from tidyverse-entry: ${configModalTidyverseGatewaySchema.tables[0]?.columns.length ?? 0} columns on ${configModalTidyverseGatewaySchema.tables[0]?.name ?? "selected table"}.`
                                : `Schema loaded from tidyverse-entry: ${configModalTidyverseGatewaySchema.tables.length} table${configModalTidyverseGatewaySchema.tables.length === 1 ? "" : "s"} available for AI generation.`}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-amber-300">
                              Run the upstream tidyverse-entry node to cache schema definitions for this AI generator.
                            </p>
                          )}
                          <p className={`mt-1 text-xs ${configModalTidyverseGatewayDataDictionary ? "text-emerald-300" : "text-slate-500"}`}>
                            {configModalTidyverseGatewayDataDictionary
                              ? "Data dictionary forwarded from the selected Source and included in AI generation."
                              : "No data dictionary is defined for this Source yet."}
                          </p>
                        </>
                      ) : (
                        <p className="mt-2 text-slate-400">Connect this tidyverse step through a tidyverse-entry node and configure Source to enable lazy database-aware generation.</p>
                      )}
                    </div>
                    <textarea
                      className="min-h-[96px] w-full rounded-[10px] border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                      onChange={(event) => setTidyverseAiPrompt(event.target.value)}
                      placeholder="Describe the tidyverse code you want, such as a lazy dbplyr pipeline, a filtered aggregation, or a targeted query that uses the forwarded db/connection handle without reconnecting."
                      value={tidyverseAiPrompt}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        className={compactButtonClassName}
                        disabled={
                          tidyverseGeneratePending ||
                          !tidyverseAiPrompt.trim() ||
                          !configModalTidyverseExecutionPlan ||
                          !("steps" in configModalTidyverseExecutionPlan) ||
                          !configModalTidyverseExecutionPlan.sourceConnectionId
                        }
                        onClick={() => void generateTidyverseScriptFromModal()}
                        type="button"
                      >
                        <Sparkles className="mr-1 h-3.5 w-3.5" />
                        {tidyverseGeneratePending ? "Generating…" : "Generate tidyverse code"}
                      </Button>
                      {tidyverseProviderModel ? <Badge className={compactBadgeClassName}>{tidyverseProviderModel}</Badge> : null}
                    </div>
                    {!tidyverseAiPrompt.trim() ? (
                      <p className="text-[11px] text-slate-400">Enter a prompt to enable the tidyverse AI generator.</p>
                    ) : null}
                    {tidyverseAiMessage ? <p className="text-[11px] text-emerald-300">{tidyverseAiMessage}</p> : null}
                    {tidyverseAiError ? <p className="text-[11px] text-rose-300">{tidyverseAiError}</p> : null}
                    {tidyverseGenerationPrompt ? (
                      <details className="rounded-[10px] border border-white/10 bg-slate-950/35 p-3">
                        <summary className="cursor-pointer text-[11px] text-slate-300">Show generation prompt</summary>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[10px] leading-relaxed text-slate-300">
                          {tidyverseGenerationPrompt}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                  <textarea
                    className="h-[min(24vh,180px)] min-h-[140px] w-full rounded-[10px] border border-white/10 bg-slate-950/40 px-3 py-2 font-mono text-[12px] text-slate-100 outline-none focus:border-emerald-400"
                    onChange={(event) =>
                      setNodeConfigDraft((current) => (current ? { ...current, script: event.target.value } : current))
                    }
                    value={nodeConfigDraft.script}
                  />
                  <label className="block space-y-1">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Node params JSON</span>
                    <textarea
                      className="h-[min(11vh,72px)] min-h-[48px] w-full rounded-[10px] border border-white/10 bg-slate-950/40 px-3 py-2 font-mono text-[12px] text-slate-100 outline-none focus:border-emerald-400"
                      onChange={(event) =>
                        setNodeConfigDraft((current) => (current ? { ...current, paramsText: event.target.value } : current))
                      }
                      value={nodeConfigDraft.paramsText}
                    />
                  </label>
                  <div className="flex flex-wrap justify-end gap-3">
                    <Button
                      disabled={executionPending || configModalNode.disabled}
                      onClick={() => void runNodeFromModal()}
                      type="button"
                      variant="outline"
                    >
                      <Play className="mr-1 h-3.5 w-3.5" />
                      {runningNodeId === configModalNode.id ? "Running…" : "Save and run"}
                    </Button>
                  </div>
                  <div className="space-y-3 rounded-[10px] border border-white/10 bg-slate-950/35 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <HoverSubtitleTitle
                        subtitle="Review the latest tidyverse execution summary and console output for this node."
                        title="Tidyverse console"
                      />
                      {configModalNodeResult ? <Badge className={compactBadgeClassName}>{configModalNodeResult.status}</Badge> : null}
                    </div>
                    {configModalNodeResult ? (
                      <>
                        <p className="text-sm text-slate-300">{configModalNodeResult.summary}</p>
                        <div className="rounded-[10px] border border-white/10 bg-slate-950/45 p-3">
                          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Logs</p>
                          {configModalNodeResult.logs && configModalNodeResult.logs.length > 0 ? (
                            <pre className="mt-2 max-h-[min(18vh,140px)] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-300">
                              {configModalNodeResult.logs.join("\n")}
                            </pre>
                          ) : (
                            <p className="mt-2 text-xs text-slate-400">No logs were returned for the latest tidyverse run.</p>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-slate-400">Run this tidyverse node from the modal to inspect its status and logs here.</p>
                    )}
                  </div>
                </div>
              ) : null}

              {configModalNode.kind === "tidyverse-viewer" ? (
                <div className="space-y-3 rounded-[14px] border border-white/10 bg-slate-950/30 p-4">
                  <HoverSubtitleTitle
                    subtitle="The main tidyverse viewer now opens as a floating two-pane window and automatically follows the latest tidyverse execution."
                    title="Tidyverse result viewer"
                  />
                  <div className="rounded-[10px] border border-white/10 bg-slate-950/35 p-3 text-sm text-slate-300">
                    <p>{configModalViewerSourceNode ? `Connected to ${configModalViewerSourceNode.label}` : "No upstream tidyverse node connected yet."}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {configModalViewerSourceNode
                        ? "Use the button below to open the floating viewer window for this tidyverse result."
                        : "Run a tidyverse-script node, then open the floating viewer window to inspect its latest result."}
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={() => {
                        openTidyverseViewerWindow(configModalViewerSourceNodeId ?? lastExecutedTidyverseNodeId);
                        setConfigModalNodeId(null);
                      }}
                      type="button"
                      variant="outline"
                    >
                      <FileSearch2 className="mr-1 h-3.5 w-3.5" />
                      Open floating viewer
                    </Button>
                  </div>
                </div>
              ) : null}

              {configModalNode.kind === "source" ? (
                <div className="space-y-4 rounded-[14px] border border-white/10 bg-slate-950/30 p-4">
                  <div className="space-y-3 rounded-[10px] border border-white/10 bg-slate-950/35 p-3">
                      <HoverSubtitleTitle
                        subtitle="Server JavaScript nodes receive Source metadata plus a live db.query(...) handle. Tidyverse-entry forwards the same Source connection into lazy R execution."
                        title="Workflow connection"
                      />
                    <select
                      className="w-full rounded-[10px] border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400"
                      onChange={(event) =>
                        setNodeConfigDraft((current) => (current ? { ...current, sourceId: event.target.value } : current))
                      }
                      value={nodeConfigDraft.sourceId}
                    >
                      <option value="">No workflow connection</option>
                      {tidyverseSources.map((source) => (
                        <option key={source.id} value={source.id}>
                          {`${source.name} (${source.sourceKind === "persistent-import" ? `Persistent import · ${source.tableName}` : source.type})`}
                        </option>
                      ))}
                    </select>
                    {configModalTidyverseSource ? (
                      <div className="rounded-[10px] border border-white/10 bg-slate-950/35 p-3 text-sm text-slate-300">
                        <p>{configModalTidyverseSource.name}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {configModalTidyverseSource.sourceKind === "persistent-import"
                            ? `Persistent import · ${configModalTidyverseSource.tableName}`
                            : `${configModalTidyverseSource.type} · ${configModalTidyverseSource.owner}`}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">Choose a workflow connection if downstream JS or tidyverse steps need database context.</p>
                    )}
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <HoverSubtitleTitle
                        subtitle="Choose the dataset that feeds the workflow. Dataset loading stays separate from the workflow connection so tidyverse scripts can remain lazy."
                        title="Source dataset"
                      />
                    </div>
                    <Button className={compactButtonClassName} onClick={() => void loadSources()} type="button" variant="ghost">
                      <RefreshCw className={`mr-1 h-3.5 w-3.5 ${refreshingSources ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                  </div>

                  <div className="rounded-[10px] border border-white/10 bg-slate-950/35 p-3 text-sm text-slate-300">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Current dataset</p>
                    <p className="mt-2 break-words text-white">{sharedDataset?.label ?? "No dataset loaded"}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {sharedDataset
                        ? `${sharedDataset.rowCount} rows · ${sharedDataset.columns.length} columns`
                        : "Select a governed source, persistent import, or import a file to drive the workflow."}
                    </p>
                  </div>

                  {loadingSources ? (
                    <p className="text-sm text-slate-400">Loading data sources…</p>
                  ) : sources.length === 0 ? (
                    <p className="rounded-[10px] border border-dashed border-white/10 bg-slate-950/20 px-3 py-4 text-sm text-slate-400">
                      No governed data sources or persistent imported tables are available for this account yet.
                    </p>
                  ) : (
                    <div className="max-h-64 space-y-2 overflow-auto pr-1">
                      {sources.map((source) => {
                        const checked = selectedSourceIds.includes(source.id);

                        return (
                          <label
                            key={source.id}
                            className={`flex cursor-pointer items-start gap-3 rounded-[10px] border px-3 py-3 transition ${
                              checked
                                ? "border-sky-400/40 bg-sky-400/10"
                                : "border-white/10 bg-slate-950/25 hover:border-white/20 hover:bg-white/[0.03]"
                            }`}
                          >
                            <input
                              checked={checked}
                              className="mt-0.5 h-4 w-4 border-white/20 bg-slate-950/50"
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
                                  <Table2 className="h-4 w-4 text-emerald-300" />
                                ) : (
                                  <DatabaseZap className="h-4 w-4 text-sky-300" />
                                )}
                                <HoverHelperLabel
                                  helper={
                                    <>
                                      <div>{`${source.type} · ${source.owner}`}</div>
                                      {source.tableName ? <div>{`Table: ${source.tableName}`}</div> : null}
                                      {source.rowCount !== null && source.columnCount !== null ? (
                                        <div>{`${source.rowCount} rows · ${source.columnCount} columns`}</div>
                                      ) : null}
                                      <div>{source.description || "No description provided."}</div>
                                    </>
                                  }
                                  label={source.name}
                                  labelClassName="break-words text-sm font-medium text-white"
                                  tooltipClassName="text-[11px]"
                                  wrapperClassName="max-w-full"
                                />
                              </div>
                              <p className="mt-1 break-words text-xs text-slate-400">
                                {source.sourceKind === "persistent-import"
                                  ? `Persistent import${source.tableName ? ` · ${source.tableName}` : ""}`
                                  : `${source.type} governed source`}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <Button disabled={loadingSources} onClick={() => void loadSelectedSourcesDataset()} type="button">
                      <DatabaseZap className="mr-1 h-3.5 w-3.5" />
                      Load selected sources
                    </Button>
                    {onOpenImportWizard ? (
                      <Button onClick={onOpenImportWizard} type="button" variant="outline">
                        <FileUp className="mr-1 h-3.5 w-3.5" />
                        Open import window
                      </Button>
                    ) : null}
                  </div>

                  {datasetLoadMessage ? <p className="text-sm text-emerald-300">{datasetLoadMessage}</p> : null}
                  {datasetLoadError ? <p className="text-sm text-rose-300">{datasetLoadError}</p> : null}
                </div>
              ) : null}

              {configModalNode?.kind === "tidyverse-entry" ? (
                <div className="space-y-3 rounded-[14px] border border-white/10 bg-slate-950/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <HoverSubtitleTitle
                      subtitle="Review the latest tidyverse execution summary and console output for this node."
                      title="Tidyverse console"
                    />
                    {configModalNodeResult ? <Badge className={compactBadgeClassName}>{configModalNodeResult.status}</Badge> : null}
                  </div>
                  {configModalNodeResult ? (
                    <>
                      <p className="text-sm text-slate-300">{configModalNodeResult.summary}</p>
                      <div className="rounded-[10px] border border-white/10 bg-slate-950/35 p-3">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Logs</p>
                        {configModalNodeResult.logs && configModalNodeResult.logs.length > 0 ? (
                          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-300">
                            {configModalNodeResult.logs.join("\n")}
                          </pre>
                        ) : (
                          <p className="mt-2 text-xs text-slate-400">No logs were returned for the latest tidyverse run.</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">Run this tidyverse node from the modal to inspect its status and logs here.</p>
                  )}
                </div>
              ) : null}

              {configModalNode.kind === "result" ? (
                <div className="rounded-[14px] border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-400">
                  This fixed node keeps its place on the workflow canvas, but you can still rename it and update its description here.
                </div>
              ) : null}

              {nodeConfigError ? <p className="text-sm text-rose-300">{nodeConfigError}</p> : null}
            </div>

            <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-white/10 bg-slate-950 px-5 py-4">
              {configModalNode.kind !== "source" && configModalNode.kind !== "result" && configModalNode.kind !== "tidyverse-script" ? (
                <Button
                  disabled={executionPending || configModalNode.disabled}
                  onClick={() => void runNodeFromModal()}
                  type="button"
                  variant="outline"
                >
                  <Play className="mr-1 h-3.5 w-3.5" />
                  {runningNodeId === configModalNode.id ? "Running…" : "Save and run"}
                </Button>
              ) : null}
              <Button onClick={() => setConfigModalNodeId(null)} type="button" variant="outline">
                Cancel
              </Button>
              <Button onClick={saveNodeConfiguration} type="button">
                Save changes
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showPluginPickerModal ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm"
          onClick={() => setShowPluginPickerModal(false)}
        >
          <div
            className="max-h-[min(90vh,1500px)] w-full max-w-3xl overflow-hidden rounded-[20px] border border-white/10 bg-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.55)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Node catalog</p>
                <h2 className="mt-1 text-lg font-semibold text-white">Select a JavaScript plugin</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Choose a saved plugin to add it as a JavaScript node on the workflow canvas.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button className={compactButtonClassName} onClick={() => void loadPlugins()} type="button" variant="ghost">
                  <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loadingPlugins ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button className={compactButtonClassName} onClick={() => setShowPluginPickerModal(false)} type="button" variant="ghost">
                  <X className="mr-1 h-3.5 w-3.5" />
                  Close
                </Button>
              </div>
            </div>

            <div className="max-h-[calc(min(90vh,1500px)-92px)] overflow-auto px-5 py-4">
              {loadingPlugins ? (
                <p className="text-sm text-slate-400">Loading plugins…</p>
              ) : plugins.length === 0 ? (
                <div className="space-y-3 rounded-[14px] border border-dashed border-white/10 bg-slate-950/25 p-4">
                  <p className="text-sm text-slate-400">No saved plugins are available yet.</p>
                  <Button
                    onClick={() => {
                      setShowCreatorDrawer(true);
                      setShowPluginPickerModal(false);
                    }}
                    type="button"
                    variant="outline"
                  >
                    Open JavaScript node creator
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {plugins.map((plugin) => (
                    <div key={plugin.id} className="rounded-[14px] border border-white/10 bg-slate-950/30 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <HoverHelperLabel
                            helper={plugin.description || "No description provided."}
                            label={plugin.name}
                            labelClassName="break-words text-sm font-medium text-white"
                            tooltipClassName="text-[11px]"
                            wrapperClassName="max-w-full"
                          />
                          <div className="mt-2 flex flex-wrap gap-1">
                            <Badge className={compactBadgeClassName}>{plugin.runtime}</Badge>
                            <Badge className={compactBadgeClassName}>{plugin.scope}</Badge>
                            <Badge className={compactBadgeClassName}>{plugin.ownerLabel}</Badge>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          onClick={() => {
                            addPluginNode(plugin);
                            setShowPluginPickerModal(false);
                          }}
                          type="button"
                        >
                          <Puzzle className="mr-1 h-3.5 w-3.5" />
                          Add node
                        </Button>
                        <Button
                          onClick={() => {
                            setEditorPluginId(plugin.id);
                            setShowCreatorDrawer(true);
                            setShowPluginPickerModal(false);
                          }}
                          type="button"
                          variant="outline"
                        >
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Edit plugin
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
