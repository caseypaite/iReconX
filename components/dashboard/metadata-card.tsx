import { Card, CardDescription, CardTitle } from "@/components/ui/card";

const columns = [
  { name: "event_name", type: "text", nulls: "0%", distribution: "page_view, click, checkout_started" },
  { name: "country", type: "text", nulls: "2%", distribution: "US 41%, DE 17%, IN 12%" },
  { name: "amount", type: "numeric", nulls: "16%", distribution: "min 0, median 43, p95 190" }
];

export function MetadataCard() {
  return (
    <Card className="h-full">
      <CardTitle>Metadata Inspector</CardTitle>
      <CardDescription>
        Column types, null ratios, and lightweight profiling stay adjacent to the result grid for guided exploration.
      </CardDescription>
      <div className="mt-5 space-y-3">
        {columns.map((column) => (
          <div key={column.name} className="rounded-[18px] border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-white">{column.name}</p>
              <span className="text-xs uppercase tracking-[0.2em] text-sky-300">{column.type}</span>
            </div>
            <p className="mt-2 text-sm text-slate-400">Nulls: {column.nulls}</p>
            <p className="mt-1 text-sm text-slate-300">{column.distribution}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
