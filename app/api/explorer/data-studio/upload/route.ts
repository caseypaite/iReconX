import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import {
  createDatasetFromMatrix,
  DATA_STUDIO_ACCEPTED_EXTENSIONS,
  DATA_STUDIO_FILE_LIMIT_BYTES
} from "@/lib/data-studio";
import { requireApiSession } from "@/lib/auth/api";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, ["ADMIN", "USER"]);

  if ("response" in auth) {
    return auth.response;
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a CSV or Excel file." }, { status: 400 });
  }

  if (file.size > DATA_STUDIO_FILE_LIMIT_BYTES) {
    return NextResponse.json({ error: "Files larger than 20 MB are not allowed." }, { status: 413 });
  }

  const extension = file.name.split(".").pop()?.toLowerCase();

  if (!extension || !DATA_STUDIO_ACCEPTED_EXTENSIONS.includes(extension as (typeof DATA_STUDIO_ACCEPTED_EXTENSIONS)[number])) {
    return NextResponse.json({ error: "Only CSV, XLS, and XLSX files are supported." }, { status: 400 });
  }

  const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), {
    type: "buffer",
    raw: true
  });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return NextResponse.json({ error: "The uploaded file did not contain any readable sheets." }, { status: 400 });
  }

  const worksheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false
  });

  const dataset = createDatasetFromMatrix(matrix, file.name, "upload", {
    sheet: sheetName,
    uploadedBy: auth.user.email
  });

  return NextResponse.json({ dataset });
}
