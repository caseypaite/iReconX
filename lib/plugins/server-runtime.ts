import vm from "node:vm";

import { createPluginHelpers } from "@/lib/plugins/execution";
import { assertValidPluginSourceCode, type PluginDefinitionRecord, type PluginExecutionInput } from "@/lib/plugins/protocol";

const SERVER_PLUGIN_TIMEOUT_MS = 3000;

type PluginModule = {
  plugin?: {
    protocolVersion?: string;
    name?: string;
    description?: string;
    runtime?: string;
  };
  run?: (input: PluginExecutionInput, helpers: ReturnType<typeof createPluginHelpers>) => Promise<unknown> | unknown;
};

function getPluginModule(sourceCode: string) {
  const cjsExports = {} as PluginModule;
  const sandbox = {
    exports: cjsExports,
    __pluginExports: cjsExports as PluginModule,
    console: {
      log: (..._args: unknown[]) => undefined,
      warn: (..._args: unknown[]) => undefined,
      error: (..._args: unknown[]) => undefined
    },
    setTimeout: undefined,
    setInterval: undefined,
    clearTimeout: undefined,
    clearInterval: undefined,
    process: undefined,
    require: undefined,
    fetch: undefined
  };

  const wrapped = `"use strict";
const module = { exports };
${sourceCode}
__pluginExports = module.exports ?? exports;`;
  const script = new vm.Script(wrapped, {
    filename: "plugin.js"
  });
  const context = vm.createContext(sandbox);

  script.runInContext(context, {
    timeout: SERVER_PLUGIN_TIMEOUT_MS
  });

  return sandbox.__pluginExports;
}

export async function runPluginOnServer(definition: PluginDefinitionRecord, input: PluginExecutionInput) {
  assertValidPluginSourceCode(definition.sourceCode);
  const pluginModule = getPluginModule(definition.sourceCode);

  if (typeof pluginModule.run !== "function") {
    throw new Error(`${definition.name} does not export a run(input, helpers) function.`);
  }

  const helpers = createPluginHelpers();
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${definition.name} exceeded the server execution time limit.`)), SERVER_PLUGIN_TIMEOUT_MS);
  });

  return Promise.race([Promise.resolve(pluginModule.run(input, helpers)), timeoutPromise]);
}
