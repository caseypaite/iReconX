import { runPluginOnServer } from "@/lib/plugins/server-runtime";
import { connectServerDatabase, type ServerDatabaseHandle } from "@/lib/plugins/server-db";
import {
  PLUGIN_PROTOCOL_VERSION,
  createPluginExecutionInput,
  normalizePluginResult,
  runtimeSupportsTarget,
  type PluginDefinitionRecord,
  type PluginExecutionResult,
  type PluginExecutionTarget
} from "@/lib/plugins/protocol";
import { getAccessibleTidyverseConnection, getAccessibleTidyverseSourceDictionary } from "@/lib/tidyverse/data-sources";
import { introspectTidyverseSourceSchema } from "@/lib/tidyverse/schema-introspection";
import { executeTidyverseScript } from "@/lib/tidyverse/service";
import type { TransformWorkflowStep } from "@/lib/transform-studio/protocol";
import type { StudioDataset } from "@/lib/data-studio";
import { sanitizeSourceConnection } from "@/lib/source-connection";
import type { AppRole } from "@/types/auth";

export async function executeTransformWorkflowGraph(args: {
  definitions: PluginDefinitionRecord[];
  initialDataset: StudioDataset | null;
  payload?: Record<string, unknown> | null;
  sourceConnectionId?: string | null;
  executionTarget: PluginExecutionTarget;
  steps: TransformWorkflowStep[];
  resultParentNodeId?: string | null;
  user: {
    sub: string;
    role: AppRole;
  };
}) {
  const definitionMap = new Map(args.definitions.map((definition) => [definition.id, definition]));
  const stepMap = new Map<string, TransformWorkflowStep>();
  const childrenByParent = new Map<string, TransformWorkflowStep[]>();
  const results: PluginExecutionResult[] = [];
  const executedNodeIds = new Set<string>();
  const nodeStateMap = new Map<
    string,
    {
      dataset: StudioDataset | null;
      lineage: PluginExecutionResult[];
      connection: Awaited<ReturnType<typeof getAccessibleTidyverseConnection>> | null;
      db: ServerDatabaseHandle | null;
      tidyverseGateway: boolean;
      result: PluginExecutionResult;
    }
  >();
  const workflowConnection = args.sourceConnectionId
    ? await getAccessibleTidyverseConnection({
        sourceId: args.sourceConnectionId,
        userId: args.user.sub,
        role: args.user.role
      })
    : null;
  const workflowDb = workflowConnection ? await connectServerDatabase(workflowConnection) : null;

  try {
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
      const parentState = step.parentNodeId === "source" ? null : nodeStateMap.get(step.parentNodeId);

      if (step.parentNodeId !== "source" && !parentState) {
        throw new Error(`Transform node ${step.nodeId} depends on an unavailable parent node.`);
      }

      const parentDataset = parentState?.dataset ?? args.initialDataset ?? null;
      const parentLineage = parentState?.lineage ?? [];
      const parentConnection = parentState?.connection ?? (step.parentNodeId === "source" ? workflowConnection : null);
      const parentDb = parentState?.db ?? (step.parentNodeId === "source" ? workflowDb : null);
      const parentGateway = parentState?.tidyverseGateway ?? false;
      const stepLabel =
        step.kind === "plugin" ? definitionMap.get(step.pluginId)?.name ?? step.label : step.label;

      let result: PluginExecutionResult;
      let nextDataset = parentDataset;
      let nextConnection = parentConnection;
      let nextDb = parentDb;
      let nextGateway = parentGateway;

      if (parentState && parentState.result.status === "error") {
        result = {
          protocolVersion: PLUGIN_PROTOCOL_VERSION,
          status: "error",
          summary: `Skipped ${stepLabel} because its upstream node failed.`
        };
      } else if (step.kind === "plugin") {
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
          dataset: parentDataset,
          payload: args.payload ?? null,
          params: step.params ?? {},
          connection: parentConnection,
          db: parentDb,
          upstream: parentLineage
        });

        result = normalizePluginResult(await runPluginOnServer(definition, input));
        nextDataset = result.dataset ?? parentDataset;
      } else if (step.kind === "tidyverse-entry") {
        if (!parentConnection) {
          throw new Error("Select a workflow connection in the Source node before running tidyverse nodes.");
        }

        nextConnection = parentConnection;
        nextDb = parentDb;
        nextGateway = true;
        const sourceSchema = await introspectTidyverseSourceSchema(nextConnection);
        const sourceDataDictionary = await getAccessibleTidyverseSourceDictionary({
          sourceId: nextConnection.sourceId,
          userId: args.user.sub,
          role: args.user.role
        });

        result = {
          protocolVersion: PLUGIN_PROTOCOL_VERSION,
          status: "success",
          summary: `Passed Source node connection ${nextConnection.sourceName} to downstream tidyverse nodes.`,
          dataset: nextDataset,
          outputs: {
            connection: sanitizeSourceConnection(nextConnection),
            sourceSchema,
            sourceDataDictionary
          },
          logs: [
            nextConnection.sourceKind === "persistent-import"
              ? `Using Source node persistent import ${nextConnection.tableSchema}.${nextConnection.tableName} for ${nextConnection.sourceName}.`
              : `Using Source node governed ${nextConnection.type} connection for ${nextConnection.sourceName}.`,
            sourceDataDictionary
              ? "Loaded the source data dictionary for downstream tidyverse AI generation."
              : "No source data dictionary is defined for this Source node yet.",
            sourceSchema
              ? sourceSchema.scope === "table"
                ? `Loaded schema for ${sourceSchema.tables[0]?.schema}.${sourceSchema.tables[0]?.name} with ${sourceSchema.tables[0]?.columns.length ?? 0} columns.`
                : `Loaded schema catalog for ${sourceSchema.tables.length} table${sourceSchema.tables.length === 1 ? "" : "s"} from ${nextConnection.schema}.`
              : "No source schema metadata was available for this connection."
          ]
        };
      } else {
        if (!nextConnection || !parentGateway) {
          throw new Error("Route tidyverse scripts through a tidyverse entry node after configuring Source so the lazy DBI connection can be forwarded correctly.");
        }

        result = await executeTidyverseScript({
          script: step.script,
          dataset: parentDataset,
          payload: args.payload ?? null,
          params: step.params ?? {},
          upstream: parentLineage,
          connection: nextConnection,
          node: {
            id: step.nodeId,
            label: step.label
          }
        });
        nextDataset = result.dataset ?? parentDataset;
      }

      const lineage = [...parentLineage, result];

      executedNodeIds.add(step.nodeId);
      nodeStateMap.set(step.nodeId, {
        dataset: nextDataset,
        lineage,
        connection: nextConnection,
        db: nextDb,
        tidyverseGateway: nextGateway,
        result
      });
      results.push(result);
      queue.push(...(childrenByParent.get(step.nodeId) ?? []));
    }

    if (executedNodeIds.size === 0) {
      throw new Error("Connect at least one executable node to the source node.");
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
  } finally {
    await workflowDb?.close();
  }
}
