import { NextRequest, NextResponse } from "next/server";

import { requireApiSession } from "@/lib/auth/api";
import { loadPersistentDataset } from "@/lib/data-studio-storage";

export async function GET(
  request: NextRequest,
  { params }: { params: { datasetId: string } }
) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const dataset = await loadPersistentDataset(params.datasetId);

  if (!dataset) {
    return NextResponse.json({ error: "Persistent imported dataset not found." }, { status: 404 });
  }

  return NextResponse.json({ dataset });
}
