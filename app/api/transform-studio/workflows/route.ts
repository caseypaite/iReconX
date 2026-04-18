import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { transformWorkflowDocumentSchema } from "@/lib/transform-studio/workflow-library";

export const dynamic = "force-dynamic";

const workflowSaveSchema = z.object({
  workflowId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  definition: transformWorkflowDocumentSchema
});

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const workflows = await prisma.transformWorkflow.findMany({
    where: {
      ownerId: auth.user.sub
    },
    orderBy: {
      updatedAt: "desc"
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return NextResponse.json({ workflows });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = workflowSaveSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid workflow payload." },
      { status: 400 }
    );
  }

  try {
    if (parsed.data.workflowId) {
      const existing = await prisma.transformWorkflow.findFirst({
        where: {
          id: parsed.data.workflowId,
          ownerId: auth.user.sub
        },
        select: {
          id: true
        }
      });

      if (!existing) {
        return NextResponse.json({ error: "Saved workflow not found." }, { status: 404 });
      }
    }

    const workflow = parsed.data.workflowId
      ? await prisma.transformWorkflow.update({
          where: {
            id: parsed.data.workflowId
          },
          data: {
            name: parsed.data.name,
            definition: parsed.data.definition
          },
          select: {
            id: true,
            name: true,
            createdAt: true,
            updatedAt: true
          }
        })
      : await prisma.transformWorkflow.create({
          data: {
            ownerId: auth.user.sub,
            name: parsed.data.name,
            definition: parsed.data.definition
          },
          select: {
            id: true,
            name: true,
            createdAt: true,
            updatedAt: true
          }
        });

    return NextResponse.json({ workflow }, { status: parsed.data.workflowId ? 200 : 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A workflow with this name already exists." }, { status: 409 });
    }

    return NextResponse.json({ error: "Unable to save the workflow." }, { status: 500 });
  }
}
