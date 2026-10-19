import "server-only";
import { and, eq, inArray, isNotNull, lt, or, sql, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { decryptSecret } from "@/lib/crypto";
import { sendEmail } from "./email";
import { getWhatsAppStatus, sendWhatsApp } from "./whaple";

// The delivery worker. Messages are written as "queued" by notifyGuardians
// and sent from here: right after the request that queued them (via after()),
// and by the cron sweep for anything left over or due for a retry.
//
// Rows are claimed with FOR UPDATE SKIP LOCKED, so the after() run and the
// cron can overlap without sending anything twice.

const { messages, schools, schoolSecrets } = schema;

export const MAX_ATTEMPTS = 5;
// Wait before attempt 2, 3, 4, 5.
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
// A row stuck in "sending" this long belongs to a worker that died.
const STUCK_MS = 10 * 60_000;
const CONCURRENCY = 5;

export type DeliveryReport = { claimed: number; sent: number; retrying: number; failed: number; needsAction: number };

type Message = typeof messages.$inferSelect;
type SchoolInfo = {
  name: string;
  email: string | null;
  whapleKey: string | null;
  resendKey: string | null;
  resendFrom: string | null;
};

export async function deliverQueued(opts: {
  schoolId?: string;
  messageIds?: string[];
  limit?: number;
  // Stop claiming new batches after this long; the cron picks up the rest.
  budgetMs?: number;
}): Promise<DeliveryReport> {
  const report: DeliveryReport = { claimed: 0, sent: 0, retrying: 0, failed: 0, needsAction: 0 };
  const deadline = Date.now() + (opts.budgetMs ?? 45_000);
  const limit = opts.limit ?? 500;
  const schoolsSeen = new Map<string, SchoolInfo | null>();

  while (report.claimed < limit && Date.now() < deadline) {
    const batch = await claim({ ...opts, take: Math.min(CONCURRENCY * 4, limit - report.claimed) });
    if (batch.length === 0) break;
    report.claimed += batch.length;

    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const outcomes = await Promise.all(
        batch.slice(i, i + CONCURRENCY).map(async (m) => {
          if (!schoolsSeen.has(m.schoolId)) schoolsSeen.set(m.schoolId, await loadSchool(m.schoolId));
          return deliverOne(m, schoolsSeen.get(m.schoolId) ?? null);
        }),
      );
      for (const o of outcomes) report[o]++;
    }
  }
  return report;
}

async function claim(opts: { schoolId?: string; messageIds?: string[]; take: number }): Promise<Message[]> {
  if (opts.messageIds && opts.messageIds.length === 0) return [];
  const filters = [
    sql`status = 'queued'`,
    sql`(next_attempt_at is null or next_attempt_at <= now())`,
    opts.schoolId ? sql`school_id = ${opts.schoolId}` : undefined,
    opts.messageIds ? sql`id in ${opts.messageIds}` : undefined,
  ].filter((f) => f !== undefined);

  const result = await getDb().execute<Record<string, unknown>>(sql`
    update messages set status = 'sending', attempts = attempts + 1, locked_at = now(), updated_at = now()
    where id in (
      select id from messages
      where ${sql.join(filters, sql` and `)}
      order by created_at
      limit ${opts.take}
      for update skip locked
    )
    returning id`);
  const ids = result.rows.map((r) => r.id as string);
  if (ids.length === 0) return [];
  return getDb().select().from(messages).where(inArray(messages.id, ids));
}

async function loadSchool(schoolId: string): Promise<SchoolInfo | null> {
  const [row] = await getDb()
    .select({ school: schools, secrets: schoolSecrets })
    .from(schools)
    .leftJoin(schoolSecrets, eq(schoolSecrets.schoolId, schools.id))
    .where(eq(schools.id, schoolId));
  if (!row) return null;
  return {
    name: row.school.name,
    email: row.school.email,
    whapleKey: safeDecrypt(row.secrets?.whapleApiKey),
    resendKey: safeDecrypt(row.secrets?.resendApiKey),
    resendFrom: row.secrets?.resendFromEmail ?? null,
  };
}

async function deliverOne(m: Message, school: SchoolInfo | null): Promise<Exclude<keyof DeliveryReport, "claimed">> {
  const db = getDb();
  const finish = (patch: Partial<typeof messages.$inferInsert>) =>
    db
      .update(messages)
      .set({ lockedAt: null, ...patch })
      .where(eq(messages.id, m.id));

  // Can't go out automatically after all (the school removed its WhatsApp
  // key, or the contact is gone): hand it to the office as a phone call.
  if (!school || !m.recipient || (m.channel === "whatsapp" && !school.whapleKey)) {
    await finish({ status: "needs_action", channel: m.channel === "whatsapp" ? "call" : m.channel });
    return "needsAction";
  }

  let result;
  try {
    result =
      m.channel === "whatsapp"
        ? await sendWhatsApp(school.whapleKey!, m.recipient, m.subject ? `*${m.subject}*\n\n${m.body}` : m.body)
        : await sendEmail({
            schoolName: school.name,
            schoolApiKey: school.resendKey,
            schoolFromEmail: school.resendFrom,
            replyTo: school.email,
            to: m.recipient,
            subject: m.subject ?? school.name,
            text: m.body,
            idempotencyKey: m.id,
          });
  } catch (err) {
    result = { ok: false as const, error: err instanceof Error ? err.message : "Send failed", retryable: true };
  }

  if (result.ok) {
    await finish({
      status: "sent",
      sentAt: new Date(),
      error: null,
      nextAttemptAt: null,
      provider: m.channel === "whatsapp" ? "whaple" : "resend",
      providerMessageId: result.messageId ?? null,
    });
    return "sent";
  }

  const error = result.error.slice(0, 500);
  if (result.retryable && m.attempts < MAX_ATTEMPTS) {
    await finish({ status: "queued", error, nextAttemptAt: new Date(Date.now() + backoffMs(m.attempts)) });
    return "retrying";
  }
  await finish({ status: "failed", error, nextAttemptAt: null });
  return "failed";
}

// attempts counts tries already made, including the one that just failed.
export function backoffMs(attempts: number): number {
  return BACKOFF_MS[Math.min(Math.max(attempts, 1), BACKOFF_MS.length) - 1];
}

// Puts rows left in "sending" by a worker that died back in the queue. A
// WhatsApp that was handed to Whaple just before the crash may go twice;
// email can't, thanks to the idempotency key.
export async function requeueStuck(): Promise<number> {
  const rows = await getDb()
    .update(messages)
    .set({ status: "queued", lockedAt: null })
    .where(and(eq(messages.status, "sending"), lt(messages.lockedAt, new Date(Date.now() - STUCK_MS))))
    .returning({ id: messages.id });
  return rows.length;
}

const TRACK_FOR_MS = 3 * 24 * 60 * 60_000;
const RECHECK_MS = 5 * 60_000;

// Whaple has no webhooks, so ask it about recent WhatsApps that haven't been
// read yet and record delivered/read.
export async function refreshWhatsAppStatuses(limit = 200): Promise<{ checked: number; changed: number }> {
  const db = getDb();
  const now = Date.now();
  const rows = await db
    .select({
      id: messages.id,
      schoolId: messages.schoolId,
      status: messages.status,
      providerMessageId: messages.providerMessageId,
    })
    .from(messages)
    .where(
      and(
        eq(messages.channel, "whatsapp"),
        inArray(messages.status, ["sent", "delivered"]),
        isNotNull(messages.providerMessageId),
        sql`${messages.sentAt} > ${new Date(now - TRACK_FOR_MS)}`,
        or(isNull(messages.statusCheckedAt), lt(messages.statusCheckedAt, new Date(now - RECHECK_MS))),
      ),
    )
    .orderBy(messages.statusCheckedAt)
    .limit(limit);

  const keys = new Map<string, string | null>();
  let changed = 0;
  for (const row of rows) {
    if (!keys.has(row.schoolId)) keys.set(row.schoolId, (await loadSchool(row.schoolId))?.whapleKey ?? null);
    const key = keys.get(row.schoolId);
    const status = key ? await getWhatsAppStatus(key, row.providerMessageId!).catch(() => null) : null;
    const next = mapWhapleStatus(status);
    const patch: Partial<typeof messages.$inferInsert> = { statusCheckedAt: new Date() };
    if (next === "delivered" && row.status === "sent") {
      Object.assign(patch, { status: "delivered", deliveredAt: new Date() });
    } else if (next === "read") {
      Object.assign(patch, { status: "read", readAt: new Date() });
    } else if (next === "failed") {
      Object.assign(patch, { status: "failed", error: "WhatsApp reported the message could not be delivered" });
    }
    if (patch.status) changed++;
    await db.update(messages).set(patch).where(eq(messages.id, row.id));
  }
  return { checked: rows.length, changed };
}

export function mapWhapleStatus(status: string | null): "delivered" | "read" | "failed" | null {
  switch (status) {
    case "delivered":
      return "delivered";
    case "read":
    case "played":
      return "read";
    case "error":
      return "failed";
    default:
      return null;
  }
}

function safeDecrypt(value: string | null | undefined): string | null {
  try {
    return decryptSecret(value);
  } catch (err) {
    console.error("[delivery] could not decrypt a school secret", err);
    return null;
  }
}
