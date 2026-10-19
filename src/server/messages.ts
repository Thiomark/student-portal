import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { SchoolContext } from "@/lib/auth/context";
import { chooseRoute, type Channel } from "@/lib/messaging/channel";
import { deliverQueued } from "@/lib/messaging/delivery";
import type { AudienceInput, MessageStatus } from "@/lib/validation/messages";
import { getCurrentYear, PAGE_SIZE } from "@/server/school-data";

const {
  messages,
  guardians,
  guardianContacts,
  learnerGuardians,
  learners,
  enrolments,
  classGroups,
  schoolSecrets,
  meetings,
} = schema;

export function guardianName(g: { title?: string | null; firstName: string; lastName: string }): string {
  return [g.title, g.firstName, g.lastName].filter(Boolean).join(" ");
}

// ── Outbox ───────────────────────────────────────────────────────────────────

export async function listMessages(
  schoolId: string,
  opts: { status?: MessageStatus; channel?: Channel; relatedId?: string; page?: number },
) {
  const where: SQL[] = [eq(messages.schoolId, schoolId)];
  if (opts.status) where.push(eq(messages.status, opts.status));
  if (opts.channel) where.push(eq(messages.channel, opts.channel));
  if (opts.relatedId) where.push(eq(messages.relatedId, opts.relatedId));
  const page = Math.max(1, opts.page ?? 1);
  const rows = await getDb()
    .select({
      id: messages.id,
      guardianId: messages.guardianId,
      channel: messages.channel,
      subject: messages.subject,
      status: messages.status,
      error: messages.error,
      relatedType: messages.relatedType,
      relatedId: messages.relatedId,
      createdAt: messages.createdAt,
      sentAt: messages.sentAt,
      guardianTitle: guardians.title,
      guardianFirstName: guardians.firstName,
      guardianLastName: guardians.lastName,
    })
    .from(messages)
    .leftJoin(guardians, and(eq(guardians.id, messages.guardianId), eq(guardians.schoolId, schoolId)))
    .where(and(...where))
    // Oldest first for the to-do lists so nothing waits forever; newest first otherwise.
    .orderBy(
      opts.status === "needs_action" || opts.status === "failed"
        ? asc(messages.createdAt)
        : desc(messages.createdAt),
    )
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, page };
}

export async function countMessagesByStatus(schoolId: string) {
  const rows = await getDb()
    .select({ status: messages.status, count: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.schoolId, schoolId), inArray(messages.status, ["needs_action", "failed"])))
    .groupBy(messages.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.count])) as Partial<Record<MessageStatus, number>>;
}

export async function getMessage(schoolId: string, messageId: string) {
  const [row] = await getDb()
    .select({ message: messages, guardian: guardians })
    .from(messages)
    .leftJoin(guardians, and(eq(guardians.id, messages.guardianId), eq(guardians.schoolId, schoolId)))
    .where(and(eq(messages.schoolId, schoolId), eq(messages.id, messageId)))
    .limit(1);
  return row ?? null;
}

// Phone numbers the office can dial for a guardian (call or SMS capable).
export async function listDialableContacts(schoolId: string, guardianIds: string[]) {
  if (guardianIds.length === 0) return [];
  return getDb()
    .select({
      guardianId: guardianContacts.guardianId,
      value: guardianContacts.value,
      label: guardianContacts.label,
      voice: guardianContacts.voice,
      sms: guardianContacts.sms,
      isPrimary: guardianContacts.isPrimary,
    })
    .from(guardianContacts)
    .where(
      and(
        eq(guardianContacts.schoolId, schoolId),
        inArray(guardianContacts.guardianId, guardianIds),
        eq(guardianContacts.kind, "phone"),
        isNull(guardianContacts.deletedAt),
        sql`(${guardianContacts.voice} or ${guardianContacts.sms})`,
      ),
    )
    .orderBy(sql`${guardianContacts.isPrimary} desc`, asc(guardianContacts.createdAt));
}

// Who a printed letter should be handed to: the meeting's learner when the
// message is about a meeting, otherwise the guardian's children.
export async function letterLearners(
  schoolId: string,
  message: { guardianId: string | null; relatedType: string | null; relatedId: string | null },
) {
  const db = getDb();
  const year = await getCurrentYear(schoolId);
  const select = {
    id: learners.id,
    firstName: learners.firstName,
    lastName: learners.lastName,
    preferredName: learners.preferredName,
    className: classGroups.name,
  };
  const classJoin = and(
    eq(enrolments.learnerId, learners.id),
    isNull(enrolments.endedOn),
    year ? eq(enrolments.academicYearId, year.id) : sql`false`,
  );

  if (message.relatedType === "meeting" && message.relatedId) {
    const rows = await db
      .select(select)
      .from(meetings)
      .innerJoin(learners, eq(learners.id, meetings.learnerId))
      .leftJoin(enrolments, classJoin)
      .leftJoin(classGroups, eq(classGroups.id, enrolments.classGroupId))
      .where(and(eq(meetings.schoolId, schoolId), eq(meetings.id, message.relatedId)))
      .limit(1);
    if (rows.length) return rows;
  }
  if (!message.guardianId) return [];
  return db
    .select(select)
    .from(learnerGuardians)
    .innerJoin(learners, eq(learners.id, learnerGuardians.learnerId))
    .leftJoin(enrolments, classJoin)
    .leftJoin(classGroups, eq(classGroups.id, enrolments.classGroupId))
    .where(
      and(
        eq(learnerGuardians.schoolId, schoolId),
        eq(learnerGuardians.guardianId, message.guardianId),
        eq(learners.status, "active"),
        isNull(learners.deletedAt),
      ),
    )
    .orderBy(asc(learners.firstName));
}

// ── Routing preview ──────────────────────────────────────────────────────────

// The channel notifyGuardians will pick for each guardian, without sending.
// Mirrors its rule that WhatsApp falls back to a call when the school has no
// Whaple key.
export async function expectedRoutes(schoolId: string, guardianIds: string[]): Promise<Map<string, Channel>> {
  const out = new Map<string, Channel>();
  if (guardianIds.length === 0) return out;
  const db = getDb();
  const [rows, contacts, [secrets]] = await Promise.all([
    db
      .select({ id: guardians.id, preferredChannel: guardians.preferredChannel })
      .from(guardians)
      .where(and(eq(guardians.schoolId, schoolId), inArray(guardians.id, guardianIds))),
    db
      .select({
        guardianId: guardianContacts.guardianId,
        kind: guardianContacts.kind,
        value: guardianContacts.value,
        whatsapp: guardianContacts.whatsapp,
        sms: guardianContacts.sms,
        voice: guardianContacts.voice,
        isPrimary: guardianContacts.isPrimary,
      })
      .from(guardianContacts)
      .where(
        and(
          eq(guardianContacts.schoolId, schoolId),
          inArray(guardianContacts.guardianId, guardianIds),
          isNull(guardianContacts.deletedAt),
        ),
      ),
    db
      .select({ hasWhaple: sql<boolean>`${schoolSecrets.whapleApiKey} is not null` })
      .from(schoolSecrets)
      .where(eq(schoolSecrets.schoolId, schoolId))
      .limit(1),
  ]);
  const byGuardian = new Map<string, typeof contacts>();
  for (const c of contacts) {
    const list = byGuardian.get(c.guardianId) ?? [];
    list.push(c);
    byGuardian.set(c.guardianId, list);
  }
  for (const g of rows) {
    let channel = chooseRoute(byGuardian.get(g.id) ?? [], g.preferredChannel).channel;
    if (channel === "whatsapp" && !secrets?.hasWhaple) channel = "call";
    out.set(g.id, channel);
  }
  return out;
}

export function countByChannel(routes: Map<string, Channel>): Partial<Record<Channel, number>> {
  const counts: Partial<Record<Channel, number>> = {};
  for (const channel of routes.values()) counts[channel] = (counts[channel] ?? 0) + 1;
  return counts;
}

// ── Broadcast audiences ──────────────────────────────────────────────────────

// Distinct guardians who receive notices for the chosen learners. Class and
// grade use current-year open enrolments; "all" is every active learner.
// Returns at most `limit` ids, and whether there were more.
export async function resolveAudience(schoolId: string, input: AudienceInput, limit: number) {
  const db = getDb();
  const where: SQL[] = [
    eq(learnerGuardians.schoolId, schoolId),
    eq(learnerGuardians.receivesNotices, true),
    eq(learners.schoolId, schoolId),
    eq(learners.status, "active"),
    isNull(learners.deletedAt),
    eq(guardians.schoolId, schoolId),
    isNull(guardians.deletedAt),
  ];

  if (input.audience !== "all") {
    const year = await getCurrentYear(schoolId);
    if (!year) return { guardianIds: [] as string[], overLimit: false };
    const inClass = input.audience === "class" ? eq(classGroups.id, input.classGroupId!) : eq(classGroups.gradeId, input.gradeId!);
    where.push(
      sql`exists (select 1 from ${enrolments} e join ${classGroups} on ${classGroups.id} = e.class_group_id
        where e.learner_id = ${learners.id} and e.school_id = ${schoolId} and e.ended_on is null
        and e.academic_year_id = ${year.id} and ${classGroups.schoolId} = ${schoolId}
        and ${classGroups.deletedAt} is null and ${inClass})`,
    );
  }

  const rows = await db
    .selectDistinct({ id: guardians.id })
    .from(learnerGuardians)
    .innerJoin(learners, eq(learners.id, learnerGuardians.learnerId))
    .innerJoin(guardians, eq(guardians.id, learnerGuardians.guardianId))
    .where(and(...where))
    .orderBy(asc(guardians.id))
    .limit(limit + 1);
  const ids = rows.map((r) => r.id);
  return { guardianIds: ids.slice(0, limit), overLimit: ids.length > limit };
}

// ── Retry ────────────────────────────────────────────────────────────────────

export type ResendResult = { ok: true } | { ok: false; error: string };

// Re-sends one failed WhatsApp or email message over the same channel, to the
// guardian's current contact for it (the number may have been corrected since
// the first attempt). The row goes back through the delivery queue, so a
// double click can't send twice.
export async function resendMessage(ctx: SchoolContext, messageId: string): Promise<ResendResult> {
  const db = getDb();
  const schoolId = ctx.school.id;
  const [current] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.schoolId, schoolId), eq(messages.id, messageId)));
  if (!current || current.status !== "failed" || !["whatsapp", "email"].includes(current.channel)) {
    return { ok: false, error: "Only failed WhatsApp or email messages can be retried." };
  }

  const channel = current.channel as "whatsapp" | "email";
  const contacts = current.guardianId
    ? await db
        .select()
        .from(guardianContacts)
        .where(
          and(
            eq(guardianContacts.schoolId, schoolId),
            eq(guardianContacts.guardianId, current.guardianId),
            isNull(guardianContacts.deletedAt),
          ),
        )
    : [];
  const usable = contacts
    .filter((c) => (channel === "whatsapp" ? c.kind === "phone" && c.whatsapp : c.kind === "email"))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const recipient = usable.find((c) => c.value === current.recipient)?.value ?? usable[0]?.value;
  if (!recipient) {
    return {
      ok: false,
      error: channel === "whatsapp" ? "No WhatsApp number on file any more." : "No email address on file any more.",
    };
  }

  const [requeued] = await db
    .update(messages)
    .set({ status: "queued", recipient, error: null, attempts: 0, nextAttemptAt: null })
    .where(and(eq(messages.schoolId, schoolId), eq(messages.id, messageId), eq(messages.status, "failed")))
    .returning({ id: messages.id });
  if (!requeued) return { ok: false, error: "This message is already being retried." };

  // Send now so the person pressing Retry sees the result.
  await deliverQueued({ schoolId, messageIds: [messageId], budgetMs: 20_000 });
  const [after] = await db
    .select({ status: messages.status, error: messages.error })
    .from(messages)
    .where(eq(messages.id, messageId));
  if (after?.status === "sent") return { ok: true };
  if (after?.status === "queued") return { ok: false, error: `Will try again shortly (${after.error ?? "temporary error"})` };
  return { ok: false, error: after?.error ?? "Could not send" };
}
