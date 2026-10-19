import { can, getSchoolContextForApi } from "@/lib/auth/context";
import { csvCell } from "@/lib/import/csv";
import { TEMPLATE_EXAMPLE, TEMPLATE_HEADERS } from "@/lib/import/learners";

// A ready-to-fill spreadsheet with the columns the importer understands.
export async function GET(_request: Request, { params }: RouteContext<"/s/[school]/learners/import/template">) {
  const { school } = await params;
  const auth = await getSchoolContextForApi(school);
  if ("status" in auth || !can(auth.ctx, "learners.manage")) return new Response("Not found", { status: 404 });
  const body = [TEMPLATE_HEADERS, TEMPLATE_EXAMPLE].map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(`﻿${body}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="learners-import-template.csv"',
    },
  });
}
