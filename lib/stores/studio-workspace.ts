"use client";

import { create } from "zustand";

import type { StudioDataset } from "@/lib/data-studio";

type StudioWorkspaceSource = "data-studio" | "transform-studio" | "import-wizard";

type StudioWorkspaceState = {
  dataset: StudioDataset | null;
  lastUpdatedBy: StudioWorkspaceSource | null;
  setDataset: (dataset: StudioDataset | null, source: StudioWorkspaceSource) => void;
};

export const useStudioWorkspaceStore = create<StudioWorkspaceState>((set) => ({
  dataset: null,
  lastUpdatedBy: null,
  setDataset: (dataset, source) =>
    set({
      dataset,
      lastUpdatedBy: source
    })
}));
