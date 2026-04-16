import { createPluginHelpers } from "@/lib/plugins/execution";
import { assertValidPluginSourceCode, type PluginDefinitionRecord, type PluginExecutionInput } from "@/lib/plugins/protocol";

const BROWSER_PLUGIN_TIMEOUT_MS = 3000;

type BrowserPluginModule = {
  run?: (input: PluginExecutionInput, helpers: ReturnType<typeof createPluginHelpers>) => Promise<unknown> | unknown;
};

function createPluginFactory(sourceCode: string) {
  return new Function(
    "exportsObject",
    "exports",
    `"use strict";
     const process = undefined;
     const require = undefined;
     const fetch = undefined;
     const window = undefined;
     const document = undefined;
     const localStorage = undefined;
     const sessionStorage = undefined;
     const module = { exports };
     ${sourceCode}
     return module.exports ?? exportsObject;`
  ) as (exportsObject: BrowserPluginModule, exports: BrowserPluginModule) => BrowserPluginModule;
}

export async function runPluginInBrowser(definition: PluginDefinitionRecord, input: PluginExecutionInput) {
  assertValidPluginSourceCode(definition.sourceCode);
  const exportsObject = {} as BrowserPluginModule;
  const pluginModule = createPluginFactory(definition.sourceCode)(exportsObject, exportsObject);

  if (typeof pluginModule.run !== "function") {
    throw new Error(`${definition.name} does not export a run(input, helpers) function.`);
  }

  const helpers = createPluginHelpers();
  const timeoutPromise = new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error(`${definition.name} exceeded the browser execution time limit.`)), BROWSER_PLUGIN_TIMEOUT_MS);
  });

  return Promise.race([Promise.resolve(pluginModule.run(input, helpers)), timeoutPromise]);
}
