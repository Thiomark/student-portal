import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { after } from "next/server";
import { getDb, schema } from "@/db/client";
import type { SchoolContext } from "@/lib/auth/context";
import { uuidv7 } from "@/lib/ids";
import { chooseRoute, type Channel } from "./channel";
import { deliverQueued } from "./delivery";

export type NotifyOutcome = {
  guardianId: string;
  messageId: string;
  channel: Channel;
  // "queued": WhatsApp/email, sent in the background right after this request.
  // "needs_action": a call, SMS or letter for the office.
  status: "queued" | "needs_action";
};

// Queues one notice to each guardian over the best channel they have, and
// returns straight away; nothing waits on WhatsApp or email. Every notice is a
// row in `messages`. Anything that can't go out automatically (letter, call,
// SMS) is left as "needs_action" for the office to work through.
export async function notifyGuardians(
  ctx: SchoolContext,
  input: {
    guardianIds: string[];
    subject: string;
    text: string;
    relatedType?: string;
    relatedId?: string;
  },
): Promise<NotifyOutcome[]> {
  if (input.guardianIds.length === 0) return [];
  const db = getDb();
  const schoolId = ctx.school.id;

  const [guardians, contacts, [secrets]] = await Promise.all([
    db
      .select({ id: schema.guardians.id, preferredChannel: schema.guardians.preferredChannel })
      .from(schema.guardians)
      .where(and(eq(schema.guardians.schoolId, schoolId), inArray(schema.guardians.id, input.guardianIds))),
    db
      .select()
      .from(schema.guardianContacts)
      .where(
        and(
          eq(schema.guardianContacts.schoolId, schoolId),
          inArray(schema.guardianContacts.guardianId, input.guardianIds),
          isNull(schema.guardianContacts.deletedAt),
        ),
      ),
    db
      .select({ hasWhaple: sql<boolean>`${schema.schoolSecrets.whapleApiKey} is not null` })
      .from(schema.schoolSecrets)
      .where(eq(schema.schoolSecrets.schoolId, schoolId))
      .limit(1),
  ]);

  const outcomes: NotifyOutcome[] = [];
  const rows: (typeof schema.messages.$inferInsert)[] = [];
  for (const guardian of guardians) {
    let route = chooseRoute(
      contacts.filter((c) => c.guardianId === guardian.id),
      guardian.preferredChannel,
    );
    // A school without a Whaple key can't send WhatsApp; fall back to a call.
    if (route.channel === "whatsapp" && !secrets?.hasWhaple) {
      route = { ...route, channel: "call", automatic: false };
    }
    const automatic = route.automatic && Boolean(route.recipient);
    const id = uuidv7();
    rows.push({
      id,
      schoolId,
      guardianId: guardian.id,
      channel: route.channel,
      recipient: route.recipient,
      subject: input.subject,
      body: input.text,
      status: automatic ? "queued" : "needs_action",
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      createdByUserId: ctx.user.id,
    });
    outcomes.push({
      guardianId: guardian.id,
      messageId: id,
      channel: route.channel,
      status: automatic ? "queued" : "needs_action",
    });
  }

  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(schema.messages).values(rows.slice(i, i + 500));
  }

  const queued = outcomes.filter((o) => o.status === "queued").map((o) => o.messageId);
  if (queued.length > 0) scheduleDelivery(schoolId, queued);
  return outcomes;
}

// Send after the response so the person who pressed "Send" isn't kept
// waiting. Whatever doesn't fit in this run's time budget is left queued for
// the cron sweep (/api/cron/messages).
function scheduleDelivery(schoolId: string, messageIds: string[]) {
  const run = () =>
    deliverQueued({ schoolId, messageIds, budgetMs: 45_000 }).catch((err) =>
      console.error("[notify] background delivery failed", err),
    );
  try {
    after(run);
  } catch {
    // Outside a request (scripts, tests): send now.
    void run();
  }
}
