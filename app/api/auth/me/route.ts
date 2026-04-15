import { NextRequest, NextResponse } from "next/server";

import { requireApiSession } from "@/lib/auth/api";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request);

  if ("response" in auth) {
    return auth.response;
  }

  return NextResponse.json({ user: auth.user });
}

