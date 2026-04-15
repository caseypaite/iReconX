import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  content: z.string().max(50000).optional(),
  color: z.enum(["yellow", "pink", "blue", "green", "purple", "slate"]).optional(),
  pinned: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireApiSession(request);
  if (auth.response) return auth.response;

  const existing = await prisma.note.findUnique({ where: { id: params.id } });
  if (!existing || existing.userId !== auth.user.sub) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const note = await prisma.note.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.content !== undefined && { content: parsed.data.content }),
      ...(parsed.data.color !== undefined && { color: parsed.data.color }),
      ...(parsed.data.pinned !== undefined && { pinned: parsed.data.pinned }),
    },
  });

  return NextResponse.json({ note });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireApiSession(request);
  if (auth.response) return auth.response;

  const existing = await prisma.note.findUnique({ where: { id: params.id } });
  if (!existing || existing.userId !== auth.user.sub) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.note.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
