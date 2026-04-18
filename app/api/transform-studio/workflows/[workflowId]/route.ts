import { NextRequest, NextResponse } from "next/server";

import { requireApiSession } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { transformWorkflowDocumentSchema } from "@/lib/transform-studio/workflow-library";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { workflowId: string } }
) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const workflow = await prisma.transformWorkflow.findFirst({
    where: {
      id: params.workflowId,
      ownerId: auth.user.sub
    },
    select: {
      id: true,
      name: true,
      definition: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!workflow) {
    return NextResponse.json({ error: "Saved workflow not found." }, { status: 404 });
  }

  const parsedDefinition = transformWorkflowDocumentSchema.safeParse(workflow.definition);

  if (!parsedDefinition.success) {
    return NextResponse.json({ error: "Saved workflow data is invalid." }, { status: 500 });
  }

  return NextResponse.json({
    workflow: {
      ...workflow,
      definition: parsedDefinition.data
    }
  });
}
