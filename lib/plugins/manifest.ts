import { pluginManifestSchema, type PluginManifest } from "@/lib/plugins/protocol";

type PluginModule = {
  plugin?: PluginManifest;
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
  ) as (exportsObject: PluginModule, exports: PluginModule) => PluginModule;
}

export function readPluginManifest(sourceCode: string): PluginManifest | null {
  try {
    const exportsObject = {} as PluginModule;
    const pluginModule = createPluginFactory(sourceCode)(exportsObject, exportsObject);
    const parsed = pluginManifestSchema.safeParse(pluginModule.plugin);

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
