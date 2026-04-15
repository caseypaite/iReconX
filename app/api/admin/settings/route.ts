import { NextRequest, NextResponse } from "next/server";

import { requireApiSession } from "@/lib/auth/api";
import { loadAdminSettings, updateAdminSettings } from "@/lib/admin/settings";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN"]);

  if ("response" in auth) {
    return auth.response;
  }

  const fields = await loadAdminSettings();

  return NextResponse.json({ fields });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object" || !("values" in body)) {
    return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 });
  }

  const result = await updateAdminSettings((body as { values: unknown }).values, auth.user.sub);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ fields: result.fields });
}
