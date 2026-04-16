import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { HoverHelperLabel } from "@/components/ui/hover-helper-label";
import { HoverSubtitleTitle } from "@/components/ui/hover-subtitle-title";

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
      <HoverSubtitleTitle
        subtitle="Connection payloads are encrypted before persistence and remain accessible only through admin-authorized handlers."
        title="Governed data sources"
      />
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {sources.map((source) => (
          <div key={source.id} className="rounded-[18px] border border-slate-800 bg-slate-900/70 p-4">
            <HoverHelperLabel
              helper={
                <>
                  <div>{source.type}</div>
                  <div>{source.description || "No description provided."}</div>
                </>
              }
              label={source.name}
              labelClassName="font-medium text-white"
              tooltipClassName="text-sm"
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
