import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { deliverQueued, refreshWhatsAppStatuses, requeueStuck } from "@/lib/messaging/delivery";

// Background sweep for the message queue, called by Vercel Cron (see
// vercel.json) or any scheduler with `Authorization: Bearer $CRON_SECRET`:
// sends anything still queued or due for a retry, rescues rows a crashed
// worker left in "sending", and records WhatsApp delivered/read.
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!authorised(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const requeued = await requeueStuck();
  const delivery = await deliverQueued({ limit: 1000, budgetMs: 40_000 });
  const tracking = await refreshWhatsAppStatuses(200);
  return NextResponse.json({ requeued, delivery, tracking }, { headers: { "Cache-Control": "no-store" } });
}

function authorised(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
