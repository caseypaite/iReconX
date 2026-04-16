import { createDatasetFromRecords, type StudioDataset, type StudioDatasetSourceKind } from "@/lib/data-studio";
import {
  PLUGIN_PROTOCOL_VERSION,
  createPluginExecutionInput,
  normalizePluginResult,
  runtimeSupportsTarget,
  type PluginDefinitionRecord,
  type PluginExecutionResult,
  type PluginExecutionTarget
} from "@/lib/plugins/protocol";

export function cloneDataset(dataset: StudioDataset, labelOverride?: string): StudioDataset {
  return {
    ...dataset,
    label: labelOverride ?? dataset.label,
    columns: dataset.columns.map((column) => ({ ...column })),
    rows: dataset.rows.map((row) => ({ ...row })),
    metadata: dataset.metadata ? { ...dataset.metadata } : undefined
  };
}

export function createPluginHelpers() {
  return {
    createDatasetFromRecords,
    cloneDataset
  };
}

export type PluginGraphStep = {
  nodeId: string;
  pluginId: string;
  parentNodeId: string;
  params?: Record<string, unknown>;
};

export async function executePluginChain(args: {
  definitions: PluginDefinitionRecord[];
  initialDataset: StudioDataset | null;
  payload?: Record<string, unknown> | null;
  executionTarget: PluginExecutionTarget;
  steps: Array<{
    pluginId: string;
    params?: Record<string, unknown>;
  }>;
  runPlugin: (
    definition: PluginDefinitionRecord,
    input: ReturnType<typeof createPluginExecutionInput>
  ) => Promise<unknown>;
}) {
  const definitionMap = new Map(args.definitions.map((definition) => [definition.id, definition]));
  const results: PluginExecutionResult[] = [];
  let currentDataset = args.initialDataset ?? null;

  for (const step of args.steps) {
    const definition = definitionMap.get(step.pluginId);

    if (!definition) {
      throw new Error(`Plugin ${step.pluginId} is not available.`);
    }

    if (!runtimeSupportsTarget(definition.runtime, args.executionTarget)) {
      throw new Error(`${definition.name} cannot run on the ${args.executionTarget} target.`);
    }

    const input = createPluginExecutionInput({
      pluginId: definition.id,
      pluginName: definition.name,
      executionTarget: args.executionTarget,
      dataset: currentDataset,
      payload: args.payload ?? null,
      params: step.params ?? {},
      upstream: results
    });

    const rawResult = await args.runPlugin(definition, input);
    const result = normalizePluginResult(rawResult);

    results.push(result);
    currentDataset = result.dataset ?? currentDataset;

    if (result.status === "error") {
      break;
    }
  }

  return {
    results,
    finalDataset: currentDataset
  };
}

export async function executePluginGraph(args: {
  definitions: PluginDefinitionRecord[];
  initialDataset: StudioDataset | null;
  payload?: Record<string, unknown> | null;
  executionTarget: PluginExecutionTarget;
  steps: PluginGraphStep[];
  resultParentNodeId?: string | null;
  runPlugin: (
    definition: PluginDefinitionRecord,
    input: ReturnType<typeof createPluginExecutionInput>
  ) => Promise<unknown>;
}) {
  const definitionMap = new Map(args.definitions.map((definition) => [definition.id, definition]));
  const stepMap = new Map<string, PluginGraphStep>();
  const childrenByParent = new Map<string, PluginGraphStep[]>();
  const results: PluginExecutionResult[] = [];
  const executedNodeIds = new Set<string>();
  const nodeStateMap = new Map<
    string,
    {
      dataset: StudioDataset | null;
      lineage: PluginExecutionResult[];
      result: PluginExecutionResult;
    }
  >();

  for (const step of args.steps) {
    if (stepMap.has(step.nodeId)) {
      throw new Error(`Transform node ${step.nodeId} is duplicated.`);
    }

    stepMap.set(step.nodeId, step);
    childrenByParent.set(step.parentNodeId, [...(childrenByParent.get(step.parentNodeId) ?? []), step]);
  }

  const queue = [...(childrenByParent.get("source") ?? [])];

  while (queue.length > 0) {
    const step = queue.shift()!;
    const definition = definitionMap.get(step.pluginId);

    if (!definition) {
      throw new Error(`Plugin ${step.pluginId} is not available.`);
    }

    if (!runtimeSupportsTarget(definition.runtime, args.executionTarget)) {
      throw new Error(`${definition.name} cannot run on the ${args.executionTarget} target.`);
    }

    const parentState = step.parentNodeId === "source" ? null : nodeStateMap.get(step.parentNodeId);

    if (step.parentNodeId !== "source" && !parentState) {
      throw new Error(`Transform node ${step.nodeId} depends on an unavailable parent node.`);
    }

    const parentDataset = parentState?.dataset ?? args.initialDataset ?? null;
    const parentLineage = parentState?.lineage ?? [];

    let result: PluginExecutionResult;
    let nextDataset = parentDataset;

    if (parentState && parentState.result.status === "error") {
      result = {
        protocolVersion: PLUGIN_PROTOCOL_VERSION,
        status: "error",
        summary: `Skipped ${definition.name} because its upstream node failed.`
      };
    } else {
      const input = createPluginExecutionInput({
        pluginId: definition.id,
        pluginName: definition.name,
        executionTarget: args.executionTarget,
        dataset: parentDataset,
        payload: args.payload ?? null,
        params: step.params ?? {},
        upstream: parentLineage
      });

      const rawResult = await args.runPlugin(definition, input);
      result = normalizePluginResult(rawResult);
      nextDataset = result.dataset ?? parentDataset;
    }

    const lineage = [...parentLineage, result];

    executedNodeIds.add(step.nodeId);
    nodeStateMap.set(step.nodeId, {
      dataset: nextDataset,
      lineage,
      result
    });
    results.push(result);
    queue.push(...(childrenByParent.get(step.nodeId) ?? []));
  }

  if (executedNodeIds.size === 0) {
    throw new Error("Connect at least one plugin block to the source node.");
  }

  let finalDataset: StudioDataset | null = null;

  if (args.resultParentNodeId === "source") {
    finalDataset = args.initialDataset ?? null;
  } else if (args.resultParentNodeId) {
    const resultParentState = nodeStateMap.get(args.resultParentNodeId);
    finalDataset = resultParentState && resultParentState.result.status === "success" ? resultParentState.dataset : null;
  }

  return {
    results,
    finalDataset
  };
}

export function createPluginDatasetFromUnknownRecords(
  records: Array<Record<string, unknown>>,
  label: string,
  sourceKind: StudioDatasetSourceKind = "upload",
  metadata?: Record<string, string | number | boolean | null>
) {
  return createDatasetFromRecords(records, label, sourceKind, metadata);
}
