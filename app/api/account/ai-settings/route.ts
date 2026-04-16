import { NextRequest, NextResponse } from "next/server";

import { requireApiSession } from "@/lib/auth/api";
import { loadUserAiSettings, updateUserAiSettings } from "@/lib/ai/user-settings";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const providers = await loadUserAiSettings(auth.user.sub, auth.user.role);

  return NextResponse.json({ providers });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object" || !("providers" in body)) {
    return NextResponse.json({ error: "Invalid AI settings payload." }, { status: 400 });
  }

  const result = await updateUserAiSettings((body as { providers: unknown }).providers, auth.user.sub, auth.user.role);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ providers: result.providers });
}
