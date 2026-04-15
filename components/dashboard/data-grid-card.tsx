import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export function DataGridCard() {
  return (
    <Card className="h-full">
      <CardTitle>Dynamic Data Grid</CardTitle>
      <CardDescription>
        AG-Grid or a similar virtualized grid plugs in here for 10k+ row exploration without changing the surrounding dashboard contract.
      </CardDescription>
      <div className="mt-5 rounded-[18px] border border-dashed border-slate-700 bg-slate-900/70 p-6">
        <div className="grid grid-cols-[1.4fr_repeat(3,minmax(0,1fr))] gap-3 text-xs uppercase tracking-[0.2em] text-slate-400">
          <span>event_name</span>
          <span>user_id</span>
          <span>country</span>
          <span>event_timestamp</span>
        </div>
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          <div className="grid grid-cols-[1.4fr_repeat(3,minmax(0,1fr))] gap-3 rounded-[18px] border border-slate-800 bg-slate-950/50 px-3 py-3">
            <span>page_view</span>
            <span>usr_1021</span>
            <span>DE</span>
            <span>2026-04-14T14:40:11Z</span>
          </div>
          <div className="grid grid-cols-[1.4fr_repeat(3,minmax(0,1fr))] gap-3 rounded-[18px] border border-slate-800 bg-slate-950/50 px-3 py-3">
            <span>checkout_started</span>
            <span>usr_1043</span>
            <span>US</span>
            <span>2026-04-14T14:40:31Z</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
