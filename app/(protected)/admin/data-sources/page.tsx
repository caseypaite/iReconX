import { prisma } from "@/lib/prisma";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminDataSourcesPage() {
  const sources = await prisma.dataSource.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      type: true
    }
  });

  return (
    <Card>
      <CardTitle>Governed data sources</CardTitle>
      <CardDescription>
        Connection payloads are encrypted before persistence and remain accessible only through admin-authorized handlers.
      </CardDescription>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {sources.map((source) => (
          <div key={source.id} className="rounded-[18px] border border-slate-800 bg-slate-900/70 p-4">
            <p className="font-medium text-white">{source.name}</p>
            <p className="mt-1 text-sm text-slate-400">{source.type}</p>
            {source.description ? <p className="mt-3 text-sm text-slate-300">{source.description}</p> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
