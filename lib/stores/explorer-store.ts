"use client";

import { create } from "zustand";

import type { ChartKind, QueryDraft } from "@/lib/explorer/query-builder";

type ExplorerState = {
  draft: QueryDraft;
  chart: ChartKind;
  setDraft: (draft: QueryDraft) => void;
  setChart: (chart: ChartKind) => void;
};

const defaultDraft: QueryDraft = {
  mode: "builder",
  source: "warehouse-main",
  schema: "public",
  table: "events",
  limit: 250,
  sql: "select * from events order by event_timestamp desc limit 250;",
  filters: [{ field: "event_type", operator: "equals", value: "click" }]
};

export const useExplorerStore = create<ExplorerState>((set) => ({
  draft: defaultDraft,
  chart: "bar",
  setDraft: (draft) => set({ draft }),
  setChart: (chart) => set({ chart })
}));

