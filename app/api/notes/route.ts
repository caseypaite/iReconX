import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  content: z.string().max(50000).optional(),
  color: z.enum(["yellow", "pink", "blue", "green", "purple", "slate"]).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (auth.response) return auth.response;

  const notes = await prisma.note.findMany({
    where: { userId: auth.user.sub },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json({ notes });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const note = await prisma.note.create({
    data: {
      userId: auth.user.sub,
      content: parsed.data.content ?? "",
      color: parsed.data.color ?? "yellow",
    },
  });

  return NextResponse.json({ note }, { status: 201 });
}
