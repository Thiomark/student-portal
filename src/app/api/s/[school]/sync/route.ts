import { NextResponse } from "next/server";
import { can, getSchoolContextForApi } from "@/lib/auth/context";
import type { PushResponse } from "@/lib/offline/protocol";
import { pull, push, pushSchema } from "@/server/desk-sync";

// Offline desk sync. GET pulls changes since a cursor; POST pushes queued
// desk actions. Both need textbooks.issue in the school.

async function authorise(slug: string) {
  const result = await getSchoolContextForApi(slug);
  if ("status" in result) {
    return { error: NextResponse.json({ error: result.status === 401 ? "Signed out" : "Not found" }, { status: result.status }) };
  }
  if (!can(result.ctx, "textbooks.issue")) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ctx: result.ctx };
}

export async function GET(request: Request, { params }: RouteContext<"/api/s/[school]/sync">) {
  const { school } = await params;
  const auth = await authorise(school);
  if (auth.error) return auth.error;
  const cursor = new URL(request.url).searchParams.get("cursor");
  return NextResponse.json(await pull(auth.ctx, cursor), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: RouteContext<"/api/s/[school]/sync">) {
  const { school } = await params;
  const auth = await authorise(school);
  if (auth.error) return auth.error;
  const body = pushSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const results = await push(auth.ctx, body.data.deviceId, body.data.mutations);
  return NextResponse.json({ results } satisfies PushResponse, { headers: { "Cache-Control": "no-store" } });
}
