import { buildSourceCatalogDataset, type AccessibleStudioSource, type StudioDataset } from "@/lib/data-studio";

type StudioSourceListResponse = {
  error?: string;
  sources?: AccessibleStudioSource[];
} | null;

type StudioSourceDictionaryUpdateResponse = {
  error?: string;
  ok?: boolean;
} | null;

export type StudioSourceDictionaryDetail = {
  summary: string;
  scope: "table" | "schema";
  tables: Array<{
    schema: string;
    name: string;
    columns: Array<{
      name: string;
      dataType: string;
      isNullable: boolean;
      meaning: string;
    }>;
  }>;
};

type StudioSourceDictionaryDetailResponse =
  | ({
      error?: string;
    } & Partial<StudioSourceDictionaryDetail>)
  | null;

type PersistentDatasetResponse = {
  error?: string;
  dataset?: StudioDataset;
} | null;

export async function fetchAccessibleStudioSources() {
  const response = await fetch("/api/explorer/data-studio", {
    method: "GET",
    credentials: "include"
  });
  const body = (await response.json().catch(() => null)) as StudioSourceListResponse;

  if (!response.ok) {
    throw new Error(body?.error ?? "Unable to load governed data sources.");
  }

  return body?.sources ?? [];
}

export async function updateStudioSourceDictionary(source: AccessibleStudioSource, dataDictionary: string) {
  const response = await fetch("/api/explorer/data-studio", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      sourceId: source.id,
      sourceKind: source.sourceKind,
      dataDictionary
    })
  });
  const body = (await response.json().catch(() => null)) as StudioSourceDictionaryUpdateResponse;

  if (!response.ok) {
    throw new Error(body?.error ?? "Unable to save the data dictionary.");
  }
}

export async function fetchStudioSourceDictionaryDetail(sourceId: string) {
  const response = await fetch(`/api/explorer/data-studio/dictionary?sourceId=${encodeURIComponent(sourceId)}`, {
    method: "GET",
    credentials: "include"
  });
  const body = (await response.json().catch(() => null)) as StudioSourceDictionaryDetailResponse;

  if (
    !response.ok ||
    !body ||
    typeof body.summary !== "string" ||
    (body.scope !== "table" && body.scope !== "schema") ||
    !Array.isArray(body.tables)
  ) {
    throw new Error(body?.error ?? "Unable to load source dictionary columns.");
  }

  return body as StudioSourceDictionaryDetail;
}

export async function loadWorkspaceDatasetFromSources(
  sources: AccessibleStudioSource[],
  selectedSourceIds: string[]
): Promise<{
  dataset: StudioDataset;
  message: string | null;
}> {
  const scopedSources =
    selectedSourceIds.length > 0
      ? sources.filter((source) => selectedSourceIds.includes(source.id))
      : sources;

  if (scopedSources.length === 0) {
    throw new Error("Select at least one data source or upload a file.");
  }

  if (scopedSources.length === 1 && scopedSources[0].sourceKind === "persistent-import") {
    const response = await fetch(`/api/explorer/data-studio/persistent/${scopedSources[0].id}`, {
      method: "GET",
      credentials: "include"
    });
    const body = (await response.json().catch(() => null)) as PersistentDatasetResponse;

    if (!response.ok || !body?.dataset) {
      throw new Error(body?.error ?? "Unable to load the persistent imported table.");
    }

    return {
      dataset: body.dataset,
      message: "Persistent imported table loaded into the studio workspace."
    };
  }

  return {
    dataset: buildSourceCatalogDataset(
      scopedSources,
      scopedSources.length === 1 ? scopedSources[0].name : "Selected governed data sources"
    ),
    message: null
  };
}

export function getImportedDatasetMessage(dataset: StudioDataset) {
  return dataset.metadata?.importedPermanently
    ? "Latest upload loaded into the studio workspace and copied into the persistent import store."
    : "Latest upload loaded into the temporary analysis workspace.";
}
