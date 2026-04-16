"use client";

import { ArrowRight, BarChart3, Focus, Pencil, Play, Power, Puzzle, RefreshCw, Sparkles, Table2, Trash2, Unlink2 } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PluginStudioPanel } from "@/components/desktop/plugin-studio-panel";
import { ResultPreviewViewer } from "@/components/desktop/result-preview-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HoverHelperLabel } from "@/components/ui/hover-helper-label";
import { HoverSubtitleTitle } from "@/components/ui/hover-subtitle-title";
import type { ResultViewerPreview } from "@/lib/ai/result-viewer";
import type { StudioDataset } from "@/lib/data-studio";
import { runPluginInBrowser } from "@/lib/plugins/browser-runtime";
import { executePluginGraph, type PluginGraphStep } from "@/lib/plugins/execution";
import type { PluginDefinitionRecord, PluginExecutionResult, PluginExecutionTarget, PluginProviderId } from "@/lib/plugins/protocol";
import { useStudioWorkspaceStore } from "@/lib/stores/studio-workspace";
import type { AppRole } from "@/types/auth";

type TransformNodeKind = "source" | "plugin" | "result";

type TransformNode = {
  id: string;
  kind: TransformNodeKind;
  label: string;
  description: string;
  x: number;
  y: number;
  disabled?: boolean;
  pluginId?: string;
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

const compactCardClassName = "rounded-none border-white/10 bg-slate-950/78 p-3 shadow-[0_18px_40px_rgba(15,23,42,0.32)] backdrop-blur-xl";
const compactButtonClassName = "h-auto rounded-none px-2 py-1 text-[11px]";
const compactBadgeClassName = "rounded-none px-1.5 py-0.5 text-[10px]";
const nodeWidth = 168;
const nodeHeight = 108;
const minScale = 0.45;

const sourceNode: TransformNode = {
  id: "source",
  kind: "source",
  label: "Source",
  description: "Current Data Studio dataset.",
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

function describeNode(node: TransformNode, pluginMap: Map<string, PluginDefinitionRecord>) {
  if (node.kind !== "plugin") {
    return node;
  }

  const plugin = node.pluginId ? pluginMap.get(node.pluginId) : null;

  return {
    ...node,
    label: plugin?.name ?? node.label,
    description: plugin?.description || node.description
  };
}

function getPortPosition(node: TransformNode, side: "input" | "output") {
  return {
    x: side === "input" ? node.x : node.x + nodeWidth,
    y: node.y + nodeHeight / 2
  };
}

function getNodeBounds(nodes: TransformNode[]) {
  if (nodes.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: nodeWidth,
      maxY: nodeHeight,
      width: nodeWidth,
      height: nodeHeight
    };
  }

  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + nodeWidth));
  const maxY = Math.max(...nodes.map((node) => node.y + nodeHeight));

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
  const stepsByNodeId = new Map<string, PluginGraphStep>();
  const outgoingByNode = new Map<string, PluginGraphStep[]>();
  const queue: PluginGraphStep[] = [];
  const visited = new Set<string>();
  const steps: PluginGraphStep[] = [];
  const effectiveParentCache = new Map<string, string | null>();

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

    if (parentNode?.kind === "plugin" && parentNode.disabled) {
      const resolved = getEffectiveParent(parentId);
      effectiveParentCache.set(nodeId, resolved);
      return resolved;
    }

    effectiveParentCache.set(nodeId, parentId);
    return parentId;
  }

  for (const node of nodes) {
    if (node.kind !== "plugin" || node.disabled || !node.pluginId) {
      continue;
    }

    const parentNodeId = getEffectiveParent(node.id);

    if (!parentNodeId) {
      continue;
    }

    const step = {
      nodeId: node.id,
      pluginId: node.pluginId,
      parentNodeId,
      params: {}
    } satisfies PluginGraphStep;

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
    throw new Error("Connect at least one plugin block to the source node.");
  }

  const resultParentNodeId = getEffectiveParent("result");

  return {
    steps,
    branchCount: (outgoingByNode.get("source") ?? []).length,
    resultParentNodeId
  };
}

function buildNodeExecutionPlan(nodes: TransformNode[], edges: TransformEdge[], targetNodeId: string) {
  const fullPlan = buildGraphExecutionPlan(nodes, edges);
  const stepByNodeId = new Map(fullPlan.steps.map((step) => [step.nodeId, step]));
  const lineage: PluginGraphStep[] = [];
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
    resultParentNodeId: targetNodeId
  };
}

export function TransformPipelineWindow({ role }: { role: AppRole }) {
  const sharedDataset = useStudioWorkspaceStore((state) => state.dataset);
  const setWorkspaceDataset = useStudioWorkspaceStore((state) => state.setDataset);
  const [plugins, setPlugins] = useState<PluginDefinitionRecord[]>([]);
  const [nodes, setNodes] = useState<TransformNode[]>([sourceNode, resultNode]);
  const [edges, setEdges] = useState<TransformEdge[]>([]);
  const [loadingPlugins, setLoadingPlugins] = useState(true);
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
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showResultViewerDrawer, setShowResultViewerDrawer] = useState(false);
  const [showCreatorDrawer, setShowCreatorDrawer] = useState(true);
  const [editorPluginId, setEditorPluginId] = useState<string | null>(null);
  const [lastExecutedNodeId, setLastExecutedNodeId] = useState<string | null>(null);
  const [resultViewerMode, setResultViewerMode] = useState<"table" | "visual">("table");
  const [resultViewerPending, setResultViewerPending] = useState(false);
  const [resultViewerError, setResultViewerError] = useState<string | null>(null);
  const [resultViewer, setResultViewer] = useState<{
    nodeId: string;
    nodeLabel: string;
    preview: ResultViewerPreview;
    provider: PluginProviderId;
    model: string;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState>(null);

  const pluginMap = useMemo(() => new Map(plugins.map((plugin) => [plugin.id, plugin])), [plugins]);
  const editorPlugin = editorPluginId ? pluginMap.get(editorPluginId) ?? null : null;
  const displayNodes = useMemo(() => nodes.map((node) => describeNode(node, pluginMap)), [nodes, pluginMap]);
  const selectedNode = displayNodes.find((node) => node.id === selectedNodeId) ?? displayNodes[0] ?? null;
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const selectedNodeResult = selectedNode && execution ? execution.nodeResults[selectedNode.id] ?? null : null;
  const lastExecutedNode = lastExecutedNodeId ? displayNodes.find((node) => node.id === lastExecutedNodeId) ?? null : null;
  const lastExecutedNodeResult = lastExecutedNodeId && execution ? execution.nodeResults[lastExecutedNodeId] ?? null : null;
  const executionPending = runPending || runningNodeId !== null;
  const chainSummary = useMemo(() => {
    try {
      const plan = buildGraphExecutionPlan(nodes, edges);
      const publishTarget =
        plan.resultParentNodeId === "source"
          ? "Source"
          : plan.resultParentNodeId
            ? displayNodes.find((node) => node.id === plan.resultParentNodeId)?.label ?? "Connected branch"
            : null;

      return `${plan.steps.length} plugin node${plan.steps.length === 1 ? "" : "s"} across ${Math.max(plan.branchCount, 1)} branch${
        Math.max(plan.branchCount, 1) === 1 ? "" : "es"
      }${publishTarget ? `. Result publishes ${publishTarget}.` : ". Connect a branch to Result to publish a final dataset."}`;
    } catch {
      return "Connect Source to one or more plugin branches. One branch may optionally feed Result for publishing.";
    }
  }, [displayNodes, edges, nodes]);

  const centerAndFitNodes = useCallback((targetNodes: TransformNode[]) => {
    if (canvasSize.width === 0 || canvasSize.height === 0) {
      return;
    }

    const bounds = getNodeBounds(targetNodes);
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
  }, [canvasSize.height, canvasSize.width]);

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

    centerAndFitNodes(nodes);
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

  function addPluginNode(plugin: PluginDefinitionRecord) {
    const id = `plugin-${plugin.id}-${Math.random().toString(36).slice(2, 8)}`;

    setNodes((current) => [
      ...current,
      {
        id,
        kind: "plugin",
        label: plugin.name,
        description: plugin.description || "No description provided.",
        pluginId: plugin.id,
        x: 220 + current.filter((node) => node.kind === "plugin").length * 42,
        y: 68 + current.filter((node) => node.kind === "plugin").length * 28
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
      current.map((node) => (node.id === nodeId && node.kind === "plugin" ? { ...node, disabled: !node.disabled } : node))
    );
    setPendingConnectionFrom(null);
    setSelectedEdgeId(null);
    setMessage(null);
    setError(null);
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
      const referencedPluginIds = Array.from(new Set(plan.steps.map((step) => step.pluginId)));
      const selectedPlugins = plugins.filter((plugin) => referencedPluginIds.includes(plugin.id));

      if (executionTarget === "server") {
        const response = await fetch("/api/plugins/run", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            executionTarget: "server",
            dataset: sharedDataset,
            payload,
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
          throw new Error(body?.error ?? "Unable to execute the transform chain.");
        }

        const nodeResults = Object.fromEntries(body.results.map((result, index) => [plan.steps[index]?.nodeId, result]).filter(([nodeId]) => Boolean(nodeId)));
        const executedNodeId = plan.steps[Math.max(body.results.length - 1, 0)]?.nodeId ?? null;
        setExecution({
          results: body.results,
          finalDataset: body.finalDataset ?? null,
          nodeResults
        });
        setLastExecutedNodeId(executedNodeId);
      } else {
        const result = await executePluginGraph({
          definitions: selectedPlugins,
          initialDataset: sharedDataset,
          payload,
          executionTarget: "browser",
          steps: plan.steps,
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
      }

      setResultViewer(null);
      setResultViewerError(null);
      setMessage(options?.successMessage ?? "Transform chain executed.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to execute the transform chain.");
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
      setError(caughtError instanceof Error ? caughtError.message : "Unable to execute the transform chain.");
      setMessage(null);
    }
  }

  async function runNode(node: TransformNode) {
    if (executionPending) {
      return;
    }

    if (node.kind !== "plugin") {
      await runPipeline();
      return;
    }

    if (node.disabled) {
      setError("Enable this node before running it.");
      setMessage(null);
      return;
    }

    try {
      await executeGraphPlan(buildNodeExecutionPlan(nodes, edges, node.id), {
        successMessage: `${node.label} executed.`,
        runningNodeId: node.id
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to execute this node.");
      setMessage(null);
    }
  }

  function publishResultDataset() {
    if (!execution?.finalDataset) {
      return;
    }

    setWorkspaceDataset(execution.finalDataset, "transform-studio");
    setMessage("Final dataset published back to Data Studio.");
  }

  async function generateResultViewer() {
    if (!lastExecutedNode || !lastExecutedNodeResult) {
      setResultViewerError("Run a plugin node first so the viewer has output to preview.");
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
        throw new Error(body?.error ?? "Unable to generate a preview for the last executed node.");
      }

      setResultViewer({
        nodeId: lastExecutedNode.id,
        nodeLabel: lastExecutedNode.label,
        preview: body.preview,
        provider: body.provider,
        model: body.model
      });
      setResultViewerMode(body.preview.preferredView === "visual" && body.preview.visual ? "visual" : "table");
      setShowResultViewerDrawer(true);
    } catch (caughtError) {
      setResultViewerError(caughtError instanceof Error ? caughtError.message : "Unable to generate a preview for the last executed node.");
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

              const start = getPortPosition(fromNode, "output");
              const end = getPortPosition(toNode, "input");
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
            const canInput = node.kind === "plugin" || node.kind === "result";
            const canOutput = node.kind === "source" || node.kind === "plugin";
            const canDelete = node.kind === "plugin";
            const canDisable = node.kind === "plugin";
            const canRun = !executionPending && (node.kind === "plugin" ? !node.disabled : true);
            const isRunning = runningNodeId === node.id || (runPending && node.kind !== "plugin");

            return (
              <div
                key={node.id}
                className={`absolute flex flex-col border bg-slate-950/92 shadow-[0_16px_36px_rgba(15,23,42,0.38)] backdrop-blur-xl ${
                  isSelected ? "border-sky-300/55 ring-1 ring-sky-300/25" : "border-white/10"
                } ${
                  node.disabled ? "opacity-70" : ""
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedNodeId(node.id);
                  setSelectedEdgeId(null);
                }}
                onPointerDown={(event) => beginDrag(node.id, event)}
                style={{
                  left: node.x,
                  top: node.y,
                  width: nodeWidth,
                  height: nodeHeight
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
                  className="flex cursor-move items-start justify-between gap-2 border-b border-white/10 bg-white/5 px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <p className={`truncate text-[11px] font-semibold text-white ${node.disabled ? "line-through decoration-white/50" : ""}`}>{node.label}</p>
                    <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">{node.kind}</p>
                  </div>
                  {node.kind !== "plugin" ? <Badge className={compactBadgeClassName}>fixed</Badge> : null}
                </div>
                <div className="flex-1 px-2 py-1.5">
                  <p className="line-clamp-2 text-[10px] leading-snug text-slate-300">{node.description}</p>
                  {node.kind === "plugin" && node.pluginId ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge className={compactBadgeClassName}>{pluginMap.get(node.pluginId)?.runtime ?? "plugin"}</Badge>
                      {node.disabled ? <Badge className={compactBadgeClassName}>disabled</Badge> : null}
                    </div>
                  ) : null}
                </div>
                {node.kind === "plugin" ? (
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
                      <span className="flex items-center justify-center gap-1">
                        {isRunning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                        <span className="text-[10px]">Run</span>
                      </span>
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
                      <span className="flex items-center justify-center gap-1">
                        <Power className="h-3.5 w-3.5" />
                        <span className="text-[10px]">{node.disabled ? "Enable" : "Disable"}</span>
                      </span>
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
                      <span className="flex items-center justify-center gap-1">
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="text-[10px]">Delete</span>
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute left-2 right-2 top-2 z-20 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 border border-white/10 bg-slate-950/82 px-2 py-1.5 shadow-[0_14px_30px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          <p className="text-xs font-semibold text-white">Transform Studio</p>
          <Badge className={compactBadgeClassName}>{Math.round(viewTransform.scale * 100)}%</Badge>
          <Badge className={compactBadgeClassName}>
            {pendingConnectionFrom ? "Choose target input" : "Choose output to wire"}
          </Badge>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button className={compactButtonClassName} onClick={() => centerAndFitNodes(nodes)} type="button" variant="outline">
            <Focus className="mr-1 h-3.5 w-3.5" />
            Center & fit
          </Button>
          <Button className={compactButtonClassName} onClick={() => setShowLeftPanel((current) => !current)} type="button" variant="outline">
            {showLeftPanel ? "Hide tools" : "Show tools"}
          </Button>
          <Button className={compactButtonClassName} onClick={() => setShowRightPanel((current) => !current)} type="button" variant="outline">
            {showRightPanel ? "Hide details" : "Show details"}
          </Button>
          <Button className={compactButtonClassName} onClick={() => setShowResultViewerDrawer((current) => !current)} type="button" variant="outline">
            <BarChart3 className="mr-1 h-3.5 w-3.5" />
            {showResultViewerDrawer ? "Hide viewer" : "Show viewer"}
          </Button>
          <Button className={compactButtonClassName} onClick={() => setShowCreatorDrawer((current) => !current)} type="button" variant="outline">
            <Puzzle className="mr-1 h-3.5 w-3.5" />
            {showCreatorDrawer ? "Hide creator" : "Show creator"}
          </Button>
        </div>
      </div>

      {showLeftPanel ? (
        <div className="absolute left-2 top-14 bottom-2 z-20 flex w-[238px] flex-col gap-2 overflow-hidden">
          <Card className={`${compactCardClassName} min-h-0`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <HoverSubtitleTitle subtitle="Add saved plugins as compact nodes." title="Plugin blocks" />
              </div>
              <Button className={compactButtonClassName} onClick={() => void loadPlugins()} type="button" variant="ghost">
                <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loadingPlugins ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
            <div className="mt-2 space-y-2 overflow-auto pr-1">
              {loadingPlugins ? (
                <p className="text-xs text-slate-400">Loading plugins…</p>
              ) : plugins.length === 0 ? (
                <p className="text-xs text-slate-400">No saved plugins available.</p>
              ) : (
                plugins.map((plugin) => (
                  <div key={plugin.id} className="border border-white/10 bg-slate-950/25 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <HoverHelperLabel
                          helper={plugin.description || "No description provided."}
                          label={plugin.name}
                          labelClassName="truncate text-[11px] font-medium text-white"
                          tooltipClassName="text-[10px]"
                          wrapperClassName="max-w-full"
                        />
                      </div>
                      <Badge className={compactBadgeClassName}>{plugin.runtime}</Badge>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge className={compactBadgeClassName}>{plugin.scope}</Badge>
                      <Badge className={compactBadgeClassName}>{plugin.ownerLabel}</Badge>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button className={`flex-1 ${compactButtonClassName}`} onClick={() => addPluginNode(plugin)} type="button" variant="outline">
                        <Puzzle className="mr-1 h-3.5 w-3.5" />
                        Add block
                      </Button>
                      <Button
                        className={`flex-1 ${compactButtonClassName}`}
                        onClick={() => {
                          setEditorPluginId(plugin.id);
                          setShowCreatorDrawer(true);
                        }}
                        type="button"
                        variant="ghost"
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Edit
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className={`${compactCardClassName} min-h-0`}>
            <HoverSubtitleTitle
              subtitle="Run the visual chain against the current studio dataset."
              title="Execution"
            />
            <div className="mt-2 space-y-2 overflow-auto text-[11px]">
              <div className="border border-white/10 bg-slate-950/25 p-2">
                <div className="group/current-dataset relative inline-flex max-w-full">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Current dataset</p>
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 w-max max-w-xs -translate-x-1/2 rounded-md border border-white/15 bg-slate-950/95 px-2 py-1 text-xs leading-tight text-white opacity-0 shadow-lg shadow-slate-950/40 transition-opacity duration-150 group-hover/current-dataset:opacity-100">
                    {sharedDataset?.label ?? "No dataset loaded in Data Studio"}
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  {sharedDataset
                    ? `${sharedDataset.rowCount} rows · ${sharedDataset.columns.length} columns`
                    : "Load a dataset first, or use payload-only plugins."}
                </p>
              </div>
              <select
                className="w-full rounded-none border border-white/10 bg-slate-950/50 px-2 py-1 text-[11px]"
                onChange={(event) => setExecutionTarget(event.target.value as PluginExecutionTarget)}
                value={executionTarget}
              >
                <option value="browser">Run in browser</option>
                <option value="server">Run on server</option>
              </select>
              <textarea
                className="min-h-[88px] w-full rounded-none border border-white/10 bg-slate-950/40 px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-sky-400"
                onChange={(event) => setPayloadText(event.target.value)}
                placeholder='{"threshold": 10}'
                value={payloadText}
              />
              <Button className={`w-full ${compactButtonClassName}`} disabled={executionPending} onClick={() => void runPipeline()} type="button">
                <Play className="mr-1 h-3.5 w-3.5" />
                {runPending ? "Running…" : "Run chain"}
              </Button>
              <Button
                className={`w-full ${compactButtonClassName}`}
                disabled={resultViewerPending || !lastExecutedNodeResult}
                onClick={() => void generateResultViewer()}
                type="button"
                variant="outline"
              >
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                {resultViewerPending ? "Generating preview…" : "Generate AI preview"}
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
          </Card>
        </div>
      ) : null}

      {showRightPanel || showResultViewerDrawer || showCreatorDrawer ? (
        <div className="absolute right-2 top-14 bottom-2 z-20 flex gap-2 overflow-hidden">
          {showRightPanel ? (
          <div className="flex w-[270px] flex-col gap-2 overflow-hidden">
            <Card className={`${compactCardClassName} min-h-0`}>
            <HoverSubtitleTitle subtitle="Current chain and wire map." title="Pipeline summary" />
            <div className="mt-2 border border-white/10 bg-slate-950/25 p-2 text-[11px] text-slate-300">{chainSummary}</div>
            <div className="mt-2 space-y-2 overflow-auto text-[11px]">
              {edges.length === 0 ? (
                <p className="text-slate-400">No wires created yet.</p>
              ) : (
                edges.map((edge) => (
                  <div key={edge.id} className="flex items-center justify-between gap-2 border border-white/10 bg-slate-950/25 px-2 py-1.5">
                    <span className="truncate text-slate-300">
                      {displayNodes.find((node) => node.id === edge.from)?.label ?? edge.from}
                      {" -> "}
                      {displayNodes.find((node) => node.id === edge.to)?.label ?? edge.to}
                    </span>
                    <button
                      className="text-slate-400 transition hover:text-rose-300"
                      onClick={() => removeEdge(edge.id)}
                      type="button"
                    >
                      <Unlink2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </Card>

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

          <Card className={`${compactCardClassName} min-h-0`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <HoverSubtitleTitle
                  subtitle="Inspect the current node and remove it if needed."
                  title="Selected block"
                />
              </div>
              {selectedNode?.kind === "plugin" ? (
                <Button className={compactButtonClassName} onClick={() => removeNode(selectedNode.id)} type="button" variant="ghost">
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Delete
                </Button>
              ) : null}
            </div>
            {selectedNode ? (
              <div className="mt-2 space-y-2 overflow-auto text-[11px]">
                <div className="border border-white/10 bg-slate-950/25 p-2">
                  <HoverHelperLabel
                    helper={selectedNode.description}
                    label={selectedNode.label}
                    labelClassName="text-xs font-medium text-white"
                    tooltipClassName="text-[11px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="border border-white/10 bg-slate-950/25 p-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Position</p>
                    <p className="mt-1 text-slate-200">{`${Math.round(selectedNode.x)}, ${Math.round(selectedNode.y)}`}</p>
                  </div>
                  <div className="border border-white/10 bg-slate-950/25 p-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Ports</p>
                    <p className="mt-1 text-slate-200">
                      {(selectedNode.kind === "plugin" || selectedNode.kind === "result" ? "In" : "-") +
                        " / " +
                        (selectedNode.kind === "source" || selectedNode.kind === "plugin" ? "Out" : "-")}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </Card>

          <Card className={`${compactCardClassName} min-h-0`}>
            <HoverSubtitleTitle
              subtitle="Inspect the raw execution envelope for the currently selected node."
              title="Run output"
            />
            <div className="mt-2 space-y-2 overflow-auto">
              {selectedNodeResult && selectedNode ? (
                <div className="border border-white/10 bg-slate-950/25 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-white">{selectedNode.label}</p>
                    <Badge className={compactBadgeClassName}>{selectedNodeResult.status}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-300">{selectedNodeResult.summary}</p>
                  <details className="mt-2 border border-white/10 bg-slate-950/35 p-2">
                    <summary className="cursor-pointer text-[11px] text-slate-300">Show raw output</summary>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[10px] leading-relaxed text-slate-300">
                      {JSON.stringify(selectedNodeResult, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : execution && selectedNode?.kind === "plugin" ? (
                <p className="text-xs text-slate-400">This node has not produced output in the current run.</p>
              ) : execution ? (
                <p className="text-xs text-slate-400">Select a plugin node to inspect its raw output.</p>
              ) : (
                <p className="text-xs text-slate-400">Run the connected chain to inspect results here.</p>
              )}
            </div>
            {message ? <p className="mt-2 text-xs text-emerald-300">{message}</p> : null}
            {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
            </Card>
          </div>
          ) : null}

          {showResultViewerDrawer ? (
            <div className="flex w-[420px] shrink-0 flex-col overflow-hidden border border-white/10 bg-slate-950/82 shadow-[0_18px_40px_rgba(15,23,42,0.32)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
                <div>
                  <HoverSubtitleTitle
                    subtitle="Use your personal AI provider key to turn the last executed plugin output into a table or visualization preview."
                    title="AI result viewer"
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
                    <ResultPreviewViewer mode={resultViewerMode} onModeChange={setResultViewerMode} preview={resultViewer.preview} />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-400">
                      Run a plugin node or chain, then generate an AI preview to inspect the last executed plugin output as a visualization or table.
                    </p>
                    <Button
                      className={compactButtonClassName}
                      disabled={resultViewerPending || !lastExecutedNodeResult}
                      onClick={() => void generateResultViewer()}
                      type="button"
                    >
                      <Sparkles className="mr-1 h-3.5 w-3.5" />
                      {resultViewerPending ? "Generating preview…" : "Generate AI preview"}
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

          {showCreatorDrawer ? (
            <div className="flex w-[430px] shrink-0 flex-col overflow-hidden border border-white/10 bg-slate-950/82 shadow-[0_18px_40px_rgba(15,23,42,0.32)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
                <div>
                  <HoverSubtitleTitle
                    subtitle="Create and save plugins here, then add them from the plugin blocks list into the workflow."
                    title="Plugin creator"
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
    </div>
  );
}
