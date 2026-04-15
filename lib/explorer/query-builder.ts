export type FilterOperator = "equals" | "contains" | "gt" | "lt";
export type BuilderMode = "builder" | "sql";
export type ChartKind = "bar" | "line" | "scatter" | "heatmap";

export type QueryFilter = {
  field: string;
  operator: FilterOperator;
  value: string;
};

export type QueryDraft = {
  mode: BuilderMode;
  source: string;
  schema: string;
  table: string;
  limit: number;
  sql: string;
  filters: QueryFilter[];
};

export function buildQueryPayload(draft: QueryDraft) {
  return {
    source: draft.source,
    target: `${draft.schema}.${draft.table}`,
    mode: draft.mode,
    limit: draft.limit,
    filters: draft.filters.filter((filter) => filter.field && filter.value),
    sql: draft.mode === "sql" ? draft.sql : undefined
  };
}

