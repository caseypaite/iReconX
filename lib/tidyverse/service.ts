import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { normalizePluginResult, type PluginExecutionResult } from "@/lib/plugins/protocol";
import {
  tidyverseExecutionRequestSchema,
  type TidyverseConnection
} from "@/lib/tidyverse/protocol";
import type { StudioDataset } from "@/lib/data-studio";

const execFileAsync = promisify(execFile);

function getTidyverseExecutorPath() {
  return path.join(process.cwd(), "tidyverse", "plumber.R");
}

function parseTidyverseResponse(rawOutput: string, stderr = "") {
  const trimmedOutput = rawOutput.trim();

  if (!trimmedOutput) {
    throw new Error(stderr.trim() || "Tidyverse execution returned no response.");
  }

  let body: unknown;

  try {
    body = JSON.parse(trimmedOutput);
  } catch {
    throw new Error(stderr.trim() || "Tidyverse execution returned invalid JSON.");
  }

  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    throw new Error(body.error);
  }

  return normalizePluginResult(body);
}

export async function executeTidyverseScript(args: {
  script: string;
  dataset: StudioDataset | null;
  payload?: Record<string, unknown> | null;
  params?: Record<string, unknown>;
  upstream?: PluginExecutionResult[];
  connection?: TidyverseConnection | null;
  node: {
    id: string;
    label: string;
  };
}) {
  const requestPayload = tidyverseExecutionRequestSchema.parse({
    script: args.script,
    dataset: args.dataset,
    payload: args.payload ?? null,
    params: args.params ?? {},
    upstream: args.upstream ?? [],
    connection: args.connection ?? null,
    node: args.node
  });

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ireconx-tidyverse-"));
  const requestPath = path.join(tempDir, "request.json");

  try {
    await writeFile(requestPath, JSON.stringify(requestPayload), "utf8");

    try {
      const { stdout, stderr } = await execFileAsync("Rscript", [getTidyverseExecutorPath(), "--execute-request", requestPath], {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024
      });

      return parseTidyverseResponse(stdout, stderr);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "stdout" in error &&
        typeof error.stdout === "string"
      ) {
        return parseTidyverseResponse(error.stdout, "stderr" in error && typeof error.stderr === "string" ? error.stderr : "");
      }

      throw error;
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
