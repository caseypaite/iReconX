import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/lib/auth/api";
import {
  getSourceDataDictionaryColumnMeaning,
  parseSourceDataDictionary
} from "@/lib/data-dictionary";
import {
  getAccessibleTidyverseConnection,
  getAccessibleTidyverseSourceDictionaryValue
} from "@/lib/tidyverse/data-sources";
import { introspectTidyverseSourceSchema } from "@/lib/tidyverse/schema-introspection";

const sourceDictionaryDetailSchema = z.object({
  sourceId: z.string().min(1, "Source id is required.")
});

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const parsed = sourceDictionaryDetailSchema.safeParse({
    sourceId: request.nextUrl.searchParams.get("sourceId")
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid source dictionary request." }, { status: 400 });
  }

  try {
    const connection = await getAccessibleTidyverseConnection({
      sourceId: parsed.data.sourceId,
      userId: auth.user.sub,
      role: auth.user.role
    });
    const sourceSchema = await introspectTidyverseSourceSchema(connection, {
      maxTableColumns: null
    });
    const rawDictionary = await getAccessibleTidyverseSourceDictionaryValue({
      sourceId: parsed.data.sourceId,
      userId: auth.user.sub,
      role: auth.user.role
    });
    const parsedDictionary = parseSourceDataDictionary(rawDictionary);

    return NextResponse.json({
      summary: parsedDictionary.summary,
      scope: sourceSchema?.scope ?? "table",
      tables:
        sourceSchema?.tables.map((table) => ({
          schema: table.schema,
          name: table.name,
          columns: table.columns.map((column) => ({
            name: column.name,
            dataType: column.dataType,
            isNullable: column.isNullable,
            meaning: getSourceDataDictionaryColumnMeaning({
              raw: rawDictionary,
              schema: table.schema,
              table: table.name,
              name: column.name
            })
          }))
        })) ?? []
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load data dictionary columns." },
      { status: 400 }
    );
  }
}
