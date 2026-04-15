"use client";

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildQueryPayload } from "@/lib/explorer/query-builder";
import { useExplorerStore } from "@/lib/stores/explorer-store";

export function QueryBuilderCard() {
  const { draft, setDraft } = useExplorerStore();

  const payload = useMemo(() => buildQueryPayload(draft), [draft]);
  const firstFilter = draft.filters[0] ?? { field: "", operator: "equals" as const, value: "" };

  return (
    <Card className="h-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <CardTitle>SQL / Filter Builder</CardTitle>
          <CardDescription>
            The builder state translates directly into a payload that backend query endpoints can validate and execute.
          </CardDescription>
        </div>
        <Badge>{draft.mode === "builder" ? "No-code mode" : "SQL mode"}</Badge>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Input
          value={draft.source}
          onChange={(event) => setDraft({ ...draft, source: event.target.value })}
          placeholder="Data source"
        />
        <Input
          value={draft.table}
          onChange={(event) => setDraft({ ...draft, table: event.target.value })}
          placeholder="Table"
        />
        <Input
          value={firstFilter.field}
          onChange={(event) =>
            setDraft({
              ...draft,
              filters: [{ ...firstFilter, field: event.target.value }]
            })
          }
          placeholder="Filter column"
        />
        <Input
          value={firstFilter.value}
          onChange={(event) =>
            setDraft({
              ...draft,
              filters: [{ ...firstFilter, value: event.target.value }]
            })
          }
          placeholder="Filter value"
        />
      </div>

      <div className="mt-4 flex gap-3">
        <Button type="button" variant="outline" onClick={() => setDraft({ ...draft, mode: "builder" })}>
          Builder
        </Button>
        <Button type="button" variant="outline" onClick={() => setDraft({ ...draft, mode: "sql" })}>
          SQL
        </Button>
      </div>

      <div className="mt-5 rounded-[18px] border border-slate-800 bg-slate-900/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Translated request</p>
        <pre className="mt-3 overflow-x-auto text-xs text-slate-200">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </div>
    </Card>
  );
}
