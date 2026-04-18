"use client";

import { Play, Puzzle, RefreshCw, Save, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { UserAiSettingsPayload } from "@/lib/ai/provider-config";
import { HoverHelperLabel } from "@/components/ui/hover-helper-label";
import { HoverSubtitleTitle } from "@/components/ui/hover-subtitle-title";
import { Input } from "@/components/ui/input";
import { parsePluginHtmlInputFields } from "@/lib/plugins/html-inputs";
import { readPluginManifest } from "@/lib/plugins/manifest";
import { runPluginInBrowser } from "@/lib/plugins/browser-runtime";
import { executePluginChain } from "@/lib/plugins/execution";
import type {
  GeneratedPluginDraft,
  PluginDefinitionRecord,
  PluginExecutionResult,
  PluginExecutionTarget,
  PluginProviderId,
  PluginRuntimeValue,
  PluginScopeValue
} from "@/lib/plugins/protocol";
import type { StudioDataset } from "@/lib/data-studio";
import type { AppRole } from "@/types/auth";

type PluginStudioPanelProps = {
  dataset: StudioDataset | null;
  role: AppRole;
  onApplyDataset?: (dataset: StudioDataset) => void;
  onPluginsChanged?: () => void | Promise<void>;
  editorPlugin?: PluginDefinitionRecord | null;
  showSavedPlugins?: boolean;
  showChainRunner?: boolean;
};

type ChainExecutionState = {
  results: PluginExecutionResult[];
  finalDataset: StudioDataset | null;
} | null;

const compactCardClassName = "rounded-none p-3";
const compactButtonClassName = "h-auto rounded-none px-2 py-1 text-[11px]";
const compactBadgeClassName = "rounded-none px-1.5 py-0.5 text-[10px]";
const textAreaClassName =
  "min-h-[108px] w-full rounded-none border border-white/10 bg-slate-950/40 px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-sky-400";

function createEmptyDraft(scope: PluginScopeValue): GeneratedPluginDraft & {
  id?: string;
  generationPrompt: string;
  provider: PluginProviderId | null;
  providerModel: string;
  runtime: PluginRuntimeValue;
  scope: PluginScopeValue;
} {
  return {
    name: "",
    description: "",
    sourceCode: "",
    generationPrompt: "",
    provider: null,
    providerModel: "",
    runtime: "both",
    scope
  };
}

export function PluginStudioPanel({
  dataset,
  role,
  onApplyDataset,
  onPluginsChanged,
  editorPlugin = null,
  showSavedPlugins = true,
  showChainRunner = true
}: PluginStudioPanelProps) {
  const defaultScope: PluginScopeValue = role === "ADMIN" ? "shared" : "personal";
  const [plugins, setPlugins] = useState<PluginDefinitionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [generatePending, setGeneratePending] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [runPending, setRunPending] = useState(false);
  const [provider, setProvider] = useState<PluginProviderId>("copilot");
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState(createEmptyDraft(defaultScope));
  const [payloadText, setPayloadText] = useState("{}");
  const [chainIds, setChainIds] = useState<string[]>([]);
  const [runTarget, setRunTarget] = useState<PluginExecutionTarget>("browser");
  const [execution, setExecution] = useState<ChainExecutionState>(null);

  const chainPlugins = useMemo(
    () => chainIds.map((id) => plugins.find((plugin) => plugin.id === id)).filter((plugin): plugin is PluginDefinitionRecord => Boolean(plugin)),
    [chainIds, plugins]
  );
  const draftManifest = useMemo(() => readPluginManifest(draft.sourceCode), [draft.sourceCode]);
  const draftInputFields = useMemo(() => parsePluginHtmlInputFields(draftManifest?.inputForm), [draftManifest?.inputForm]);

  const loadPlugins = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

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

        setProvider(payload.defaultProvider);
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
    if (!editorPlugin) {
      return;
    }

    setDraft({
      id: editorPlugin.id,
      name: editorPlugin.name,
      description: editorPlugin.description,
      sourceCode: editorPlugin.sourceCode,
      generationPrompt: editorPlugin.generationPrompt,
      provider: editorPlugin.provider,
      providerModel: editorPlugin.providerModel,
      runtime: editorPlugin.runtime,
      scope: editorPlugin.scope
    });
    setMessage(`Loaded ${editorPlugin.name} into the editor.`);
    setError(null);
  }, [editorPlugin]);

  function resetDraft(nextScope = defaultScope) {
    setDraft(createEmptyDraft(nextScope));
  }

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

  async function generatePlugin() {
    setGeneratePending(true);
    setError(null);
    setMessage(null);

    try {
      const payload = parsePayload();
      const response = await fetch("/api/plugins/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          provider,
          runtime: draft.runtime,
          scope: draft.scope,
          userPrompt: prompt,
          dataset,
          payload
        })
      });
      const body = (await response.json().catch(() => null)) as
        | {
            error?: string;
            draft?: GeneratedPluginDraft;
            generationPrompt?: string;
            provider?: PluginProviderId;
            providerModel?: string;
          }
        | null;

      if (!response.ok || !body?.draft) {
        throw new Error(body?.error ?? "Unable to generate a plugin.");
      }

      setDraft((current) => ({
        ...current,
        ...body.draft,
        id: undefined,
        generationPrompt: body.generationPrompt ?? "",
        provider: body.provider ?? provider,
        providerModel: body.providerModel ?? ""
      }));
      setMessage("Plugin draft generated. Review the JavaScript before saving.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to generate a plugin.");
    } finally {
      setGeneratePending(false);
    }
  }

  async function savePlugin() {
    setSavePending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/plugins", {
        method: draft.id ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: draft.id,
          name: draft.name,
          description: draft.description,
          sourceCode: draft.sourceCode,
          protocolVersion: "ireconx.plugin.v1",
          generationPrompt: draft.generationPrompt,
          provider: draft.provider,
          providerModel: draft.providerModel,
          scope: draft.scope,
          runtime: draft.runtime
        })
      });
      const body = (await response.json().catch(() => null)) as { error?: string; plugin?: PluginDefinitionRecord } | null;

      if (!response.ok || !body?.plugin) {
        throw new Error(body?.error ?? "Unable to save the plugin.");
      }

      await loadPlugins();
      await onPluginsChanged?.();
      setDraft({
        ...draft,
        id: body.plugin.id
      });
      setMessage(`${body.plugin.name} saved.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to save the plugin.");
    } finally {
      setSavePending(false);
    }
  }

  async function deletePlugin() {
    if (!draft.id) {
      return;
    }

    setSavePending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/plugins", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: draft.id
        })
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to delete the plugin.");
      }

      setChainIds((current) => current.filter((id) => id !== draft.id));
      resetDraft();
      await loadPlugins();
      await onPluginsChanged?.();
      setMessage("Plugin deleted.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to delete the plugin.");
    } finally {
      setSavePending(false);
    }
  }

  function addPluginToChain(pluginId: string) {
    setChainIds((current) => (current.includes(pluginId) ? current : [...current, pluginId]));
  }

  function moveChainPlugin(index: number, direction: -1 | 1) {
    setChainIds((current) => {
      const target = index + direction;

      if (target < 0 || target >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function runChain() {
    setRunPending(true);
    setError(null);
    setMessage(null);

    try {
      const payload = parsePayload();

      if (chainPlugins.length === 0) {
        throw new Error("Add at least one plugin to the chain.");
      }

      if (runTarget === "server") {
        const response = await fetch("/api/plugins/run", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            executionTarget: "server",
            dataset,
            payload,
            steps: chainPlugins.map((plugin) => ({
              pluginId: plugin.id,
              params: {}
            }))
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
          throw new Error(body?.error ?? "Unable to run the plugin chain.");
        }

        setExecution({
          results: body.results,
          finalDataset: body.finalDataset ?? null
        });
      } else {
        const result = await executePluginChain({
          definitions: chainPlugins,
          initialDataset: dataset,
          payload,
          executionTarget: "browser",
          steps: chainPlugins.map((plugin) => ({
            pluginId: plugin.id,
            params: {}
          })),
          runPlugin: runPluginInBrowser
        });

        setExecution(result);
      }

      setMessage(`Plugin chain executed on the ${runTarget} target.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to run the plugin chain.");
    } finally {
      setRunPending(false);
    }
  }

  return (
    <div className={showSavedPlugins && showChainRunner ? "grid gap-2 xl:grid-cols-[280px_minmax(0,1.1fr)_minmax(0,0.9fr)]" : "space-y-2"}>
      {showSavedPlugins ? (
        <Card className={compactCardClassName}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <HoverSubtitleTitle
                subtitle="Personal plugins are private to you. Shared plugins are visible to everyone."
                title="Saved plugins"
              />
            </div>
            <Button className={compactButtonClassName} onClick={() => void loadPlugins()} type="button" variant="ghost">
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {loading ? (
              <p className="text-xs text-slate-400">Loading plugins…</p>
            ) : plugins.length === 0 ? (
              <p className="text-xs text-slate-400">No plugins saved yet.</p>
            ) : (
              plugins.map((plugin) => (
                <div key={plugin.id} className="border border-white/10 bg-slate-950/25 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <HoverHelperLabel
                        helper={plugin.description || "No description provided."}
                        label={plugin.name}
                        labelClassName="truncate text-xs font-medium text-white"
                        tooltipClassName="text-[10px]"
                        wrapperClassName="max-w-full"
                      />
                    </div>
                    <Badge className={compactBadgeClassName}>{plugin.scope}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge className={compactBadgeClassName}>{plugin.runtime}</Badge>
                    <Badge className={compactBadgeClassName}>{plugin.ownerLabel}</Badge>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button
                      className={`flex-1 ${compactButtonClassName}`}
                      onClick={() =>
                        setDraft({
                          id: plugin.id,
                          name: plugin.name,
                          description: plugin.description,
                          sourceCode: plugin.sourceCode,
                          generationPrompt: plugin.generationPrompt,
                          provider: plugin.provider,
                          providerModel: plugin.providerModel,
                          runtime: plugin.runtime,
                          scope: plugin.scope
                        })
                      }
                      type="button"
                      variant="outline"
                    >
                      Edit
                    </Button>
                    {showChainRunner ? (
                      <Button
                        className={`flex-1 ${compactButtonClassName}`}
                        onClick={() => addPluginToChain(plugin.id)}
                        type="button"
                        variant="ghost"
                      >
                        Add to chain
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      ) : null}

      <div className="space-y-2">
        <Card className={compactCardClassName}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <HoverSubtitleTitle
                subtitle="Generate JavaScript plugins that follow the iReconX plugin protocol, including optional workflow HTML inputs."
                title="AI plugin generator"
              />
            </div>
            <Sparkles className="h-4 w-4 text-sky-300" />
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <select className="rounded-none border border-white/10 bg-slate-950/50 px-2 py-1 text-[11px]" onChange={(event) => setProvider(event.target.value as PluginProviderId)} value={provider}>
              <option value="copilot">GitHub Copilot / Models</option>
              <option value="gemini">Gemini</option>
              <option value="mistral">Mistral</option>
            </select>
            <select
              className="rounded-none border border-white/10 bg-slate-950/50 px-2 py-1 text-[11px]"
              onChange={(event) => setDraft((current) => ({ ...current, runtime: event.target.value as PluginRuntimeValue }))}
              value={draft.runtime}
            >
              <option value="both">Browser + server</option>
              <option value="browser">Browser only</option>
              <option value="server">Server only</option>
            </select>
            <select
              className="rounded-none border border-white/10 bg-slate-950/50 px-2 py-1 text-[11px]"
              onChange={(event) => setDraft((current) => ({ ...current, scope: event.target.value as PluginScopeValue }))}
              value={draft.scope}
            >
              <option value="personal">Personal</option>
              {role === "ADMIN" ? <option value="shared">Shared</option> : null}
            </select>
            <Button className={compactButtonClassName} disabled={generatePending || prompt.trim().length === 0} onClick={() => void generatePlugin()} type="button">
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              {generatePending ? "Generating…" : "Generate plugin"}
            </Button>
          </div>
          {prompt.trim().length === 0 ? (
            <p className="mt-2 text-[11px] text-slate-400">Enter a prompt to enable plugin generation.</p>
          ) : null}
          <textarea
            className={`${textAreaClassName} mt-2`}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the data transformation or input-processing plugin you want."
            value={prompt}
          />
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <div className="border border-white/10 bg-slate-950/25 p-2">
              <div className="group/dataset-context relative inline-flex max-w-full">
                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Dataset context</p>
                <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 w-max max-w-xs -translate-x-1/2 rounded-md border border-white/15 bg-slate-950/95 px-2 py-1 text-xs leading-tight text-slate-200 opacity-0 shadow-lg shadow-slate-950/40 transition-opacity duration-150 group-hover/dataset-context:opacity-100">
                  {dataset?.label ?? "No dataset loaded"}
                </div>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                {dataset ? `${dataset.rowCount} rows · ${dataset.columns.length} columns` : "Generate plugins for payload-only inputs if needed."}
              </p>
            </div>
            <div className="border border-white/10 bg-slate-950/25 p-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Payload JSON</p>
              <textarea className={`${textAreaClassName} mt-1 min-h-[76px]`} onChange={(event) => setPayloadText(event.target.value)} value={payloadText} />
            </div>
          </div>
        </Card>

        <Card className={compactCardClassName}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <HoverSubtitleTitle
                subtitle="Edit the generated source, then save it as a reusable plugin. Add plugin.inputForm to expose workflow controls in Transform Studio."
                title="Plugin draft"
              />
            </div>
            {draft.providerModel ? <Badge className={compactBadgeClassName}>{draft.providerModel}</Badge> : null}
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <Input onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Plugin name" value={draft.name} />
            <Input onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Short description" value={draft.description} />
          </div>
          <textarea
            className={`${textAreaClassName} mt-2 min-h-[280px] font-mono`}
            onChange={(event) => setDraft((current) => ({ ...current, sourceCode: event.target.value }))}
            placeholder="Generated plugin JavaScript appears here."
            value={draft.sourceCode}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button className={compactButtonClassName} disabled={savePending || draft.sourceCode.trim().length === 0 || draft.name.trim().length === 0} onClick={() => void savePlugin()} type="button">
              <Save className="mr-1 h-3.5 w-3.5" />
              {savePending ? "Saving…" : draft.id ? "Update plugin" : "Save plugin"}
            </Button>
            {showChainRunner ? (
              <Button className={compactButtonClassName} disabled={!draft.id} onClick={() => addPluginToChain(draft.id!)} type="button" variant="outline">
                <Puzzle className="mr-1 h-3.5 w-3.5" />
                Add draft to chain
              </Button>
            ) : null}
            <Button className={compactButtonClassName} disabled={!draft.id || savePending} onClick={() => void deletePlugin()} type="button" variant="ghost">
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete
            </Button>
            <Button className={compactButtonClassName} onClick={() => resetDraft()} type="button" variant="ghost">
              Reset draft
            </Button>
          </div>
          <div className="mt-2 border border-white/10 bg-slate-950/25 p-2">
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Workflow inputs</p>
            {draftInputFields.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {draftInputFields.map((field) => (
                  <Badge key={field.name} className={compactBadgeClassName}>{`${field.name} · ${field.type}`}</Badge>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[11px] text-slate-400">
                No workflow inputs detected. Add plugin.inputForm HTML with named controls to configure node params in Transform Studio.
              </p>
            )}
          </div>
          {draft.generationPrompt ? (
            <details className="mt-2 border border-white/10 bg-slate-950/25 p-2">
              <summary className="cursor-pointer text-[11px] text-slate-300">Show encapsulated protocol prompt</summary>
              <pre className="mt-2 whitespace-pre-wrap text-[10px] text-slate-400">{draft.generationPrompt}</pre>
            </details>
          ) : null}
        </Card>
      </div>

      {showChainRunner ? (
        <Card className={compactCardClassName}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <HoverSubtitleTitle
                subtitle="Order saved plugins, run them against the current dataset/payload, and apply the final dataset back into Data Studio."
                title="Plugin chain runner"
              />
            </div>
            <select
              className="rounded-none border border-white/10 bg-slate-950/50 px-2 py-1 text-[11px]"
              onChange={(event) => setRunTarget(event.target.value as PluginExecutionTarget)}
              value={runTarget}
            >
              <option value="browser">Run in browser</option>
              <option value="server">Run on server</option>
            </select>
          </div>
          <div className="mt-3 space-y-2">
            {chainPlugins.length === 0 ? (
              <p className="text-xs text-slate-400">No plugins added to the chain yet.</p>
            ) : (
              chainPlugins.map((plugin, index) => (
                <div key={`${plugin.id}-${index}`} className="border border-white/10 bg-slate-950/25 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <HoverHelperLabel
                        helper={plugin.description}
                        label={`${index + 1}. ${plugin.name}`}
                        labelClassName="text-xs font-medium text-white"
                        tooltipClassName="text-[10px]"
                      />
                    </div>
                    <Badge className={compactBadgeClassName}>{plugin.runtime}</Badge>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button className={compactButtonClassName} disabled={index === 0} onClick={() => moveChainPlugin(index, -1)} type="button" variant="outline">
                      Up
                    </Button>
                    <Button className={compactButtonClassName} disabled={index === chainPlugins.length - 1} onClick={() => moveChainPlugin(index, 1)} type="button" variant="outline">
                      Down
                    </Button>
                    <Button
                      className={compactButtonClassName}
                      onClick={() => setChainIds((current) => current.filter((id, currentIndex) => !(id === plugin.id && currentIndex === index)))}
                      type="button"
                      variant="ghost"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className={compactButtonClassName} disabled={runPending || chainPlugins.length === 0} onClick={() => void runChain()} type="button">
              <Play className="mr-1 h-3.5 w-3.5" />
              {runPending ? "Running…" : `Run on ${runTarget}`}
            </Button>
            <Button
              className={compactButtonClassName}
              disabled={!execution?.finalDataset || !onApplyDataset}
              onClick={() => execution?.finalDataset && onApplyDataset?.(execution.finalDataset)}
              type="button"
              variant="outline"
            >
              Apply final dataset
            </Button>
          </div>
          {execution ? (
            <div className="mt-3 space-y-2">
              {execution.results.map((result, index) => (
                <div key={`${index}-${result.summary}`} className="border border-white/10 bg-slate-950/25 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-white">{`Step ${index + 1}`}</p>
                    <Badge className={compactBadgeClassName}>{result.status}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-300">{result.summary}</p>
                  {result.logs?.length ? <pre className="mt-2 whitespace-pre-wrap text-[10px] text-slate-500">{result.logs.join("\n")}</pre> : null}
                </div>
              ))}
              <div className="border border-white/10 bg-slate-950/25 p-2">
                <div className="group/final-dataset relative inline-flex max-w-full">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Final dataset</p>
                  <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 w-max max-w-xs -translate-x-1/2 rounded-md border border-white/15 bg-slate-950/95 px-2 py-1 text-xs leading-tight text-white opacity-0 shadow-lg shadow-slate-950/40 transition-opacity duration-150 group-hover/final-dataset:opacity-100">
                    {execution.finalDataset?.label ?? "No dataset returned"}
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  {execution.finalDataset ? `${execution.finalDataset.rowCount} rows · ${execution.finalDataset.columns.length} columns` : "The chain kept the existing dataset."}
                </p>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {message ? <p className="text-xs text-emerald-300">{message}</p> : null}
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
