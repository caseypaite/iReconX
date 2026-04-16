import { NextRequest, NextResponse } from "next/server";

import { requireApiSession } from "@/lib/auth/api";
import { deletePluginDefinition, listAccessiblePlugins, savePluginDefinition } from "@/lib/plugins/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const plugins = await listAccessiblePlugins(auth.user.sub, auth.user.role);
  return NextResponse.json({ plugins });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const result = await savePluginDefinition(body, auth.user);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ plugin: result.plugin }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const result = await savePluginDefinition(body, auth.user);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ plugin: result.plugin });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const result = await deletePluginDefinition((body as { id?: unknown } | null)?.id, auth.user);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
