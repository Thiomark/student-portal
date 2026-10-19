import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import type { SchoolContext } from "@/lib/auth/context";
import { formatDate, fullName, schoolToday, shiftDate } from "@/lib/format";
import { uuidv7 } from "@/lib/ids";
import { notifyGuardians } from "@/lib/messaging/notify";
import { ATTENDANCE_STATUSES } from "@/lib/offline/protocol";
import { Rejected, type Applied, type Tx } from "./common";

const { attendanceRegisters, attendanceRecords, classGroups, learners, learnerGuardians } = schema;

// Teachers fix last week's register; anything older goes through the office.
export const MAX_REGISTER_AGE_DAYS = 30;

export const registerPayload = z.object({
  registerId: z.uuid(),
  classGroupId: z.uuid(),
  date: z.iso.date(),
  marks: z
    .array(
      z.object({
        learnerId: z.uuid(),
        status: z.enum(ATTENDANCE_STATUSES as ["present", ...("absent" | "late" | "excused")[]]),
        reason: z.string().trim().max(200).nullish(),
      }),
    )
    .min(1)
    .max(200),
  notifyAbsences: z.boolean(),
});

export async function applyRegister(
  tx: Tx,
  ctx: SchoolContext,
  payload: z.infer<typeof registerPayload>,
  at: Date,
): Promise<Applied> {
  const schoolId = ctx.school.id;
  const today = schoolToday(ctx.school.timezone);
  if (payload.date > today) throw new Rejected("A register can't be taken for a future date");
  if (payload.date < shiftDate(today, -MAX_REGISTER_AGE_DAYS)) {
    throw new Rejected(`Registers older than ${MAX_REGISTER_AGE_DAYS} days must be corrected by the office`);
  }

  const [klass] = await tx
    .select({ id: classGroups.id, name: classGroups.name })
    .from(classGroups)
    .where(
      and(eq(classGroups.schoolId, schoolId), eq(classGroups.id, payload.classGroupId), isNull(classGroups.deletedAt)),
    );
  if (!klass) throw new Rejected("Class not found");

  const learnerIds = [...new Set(payload.marks.map((m) => m.learnerId))];
  const known = await tx
    .select({ id: learners.id })
    .from(learners)
    .where(and(eq(learners.schoolId, schoolId), inArray(learners.id, learnerIds), isNull(learners.deletedAt)));
  if (known.length !== learnerIds.length) {
    throw new Rejected("Some learners on this register are no longer at the school. Sync and take it again.");
  }

  // Retaking a register keeps the first one's id and replaces the marks.
  const [register] = await tx
    .insert(attendanceRegisters)
    .values({
      id: payload.registerId,
      schoolId,
      classGroupId: klass.id,
      date: payload.date,
      takenByStaffId: ctx.membership.staffId,
      takenAt: at,
    })
    .onConflictDoUpdate({
      target: [attendanceRegisters.classGroupId, attendanceRegisters.date],
      set: { takenByStaffId: ctx.membership.staffId, takenAt: at, updatedAt: new Date() },
    })
    .returning({ id: attendanceRegisters.id });

  const rows = await tx
    .insert(attendanceRecords)
    .values(
      payload.marks.map((m) => ({
        id: uuidv7(),
        schoolId,
        registerId: register.id,
        learnerId: m.learnerId,
        date: payload.date,
        status: m.status,
        reason: m.reason || null,
      })),
    )
    .onConflictDoUpdate({
      target: [attendanceRecords.learnerId, attendanceRecords.date],
      set: {
        registerId: register.id,
        status: sql`excluded.status`,
        reason: sql`excluded.reason`,
        updatedAt: new Date(),
      },
    })
    .returning({
      learnerId: attendanceRecords.learnerId,
      status: attendanceRecords.status,
      notifiedAt: attendanceRecords.guardiansNotifiedAt,
    });

  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const r of rows) counts[r.status]++;

  // Only today's absences are worth a message; a register synced days later
  // would just confuse parents. Each absence is told once.
  const toNotify =
    payload.notifyAbsences && payload.date === today
      ? rows.filter((r) => r.status === "absent" && !r.notifiedAt).map((r) => r.learnerId)
      : [];

  return {
    activity: {
      action: "attendance.register_taken",
      entityType: "attendance_register",
      entityId: register.id,
      subject: `${klass.name} · ${payload.date}`,
      meta: { ...counts, notifying: toNotify.length },
    },
    afterCommit: toNotify.length ? () => notifyAbsences(ctx, toNotify, payload.date) : undefined,
  };
}

async function notifyAbsences(ctx: SchoolContext, learnerIds: string[], date: string): Promise<void> {
  const db = getDb();
  const schoolId = ctx.school.id;
  const [absentees, links] = await Promise.all([
    db
      .select({ id: learners.id, firstName: learners.firstName, lastName: learners.lastName, preferredName: learners.preferredName })
      .from(learners)
      .where(and(eq(learners.schoolId, schoolId), inArray(learners.id, learnerIds))),
    db
      .select({ learnerId: learnerGuardians.learnerId, guardianId: learnerGuardians.guardianId })
      .from(learnerGuardians)
      .where(
        and(
          eq(learnerGuardians.schoolId, schoolId),
          inArray(learnerGuardians.learnerId, learnerIds),
          eq(learnerGuardians.receivesNotices, true),
        ),
      ),
  ]);
  const when = formatDate(`${date}T12:00:00Z`, ctx.school.timezone);

  for (const learner of absentees) {
    const guardianIds = links.filter((l) => l.learnerId === learner.id).map((l) => l.guardianId);
    if (guardianIds.length === 0) continue;
    // Claim first: a second sync of a corrected register mustn't message twice.
    const [claimed] = await db
      .update(attendanceRecords)
      .set({ guardiansNotifiedAt: new Date() })
      .where(
        and(
          eq(attendanceRecords.learnerId, learner.id),
          eq(attendanceRecords.date, date),
          eq(attendanceRecords.status, "absent"),
          isNull(attendanceRecords.guardiansNotifiedAt),
        ),
      )
      .returning({ id: attendanceRecords.id });
    if (!claimed) continue;
    await notifyGuardians(ctx, {
      guardianIds,
      subject: `${fullName(learner)} is absent today`,
      text: [
        `${fullName(learner)} was marked absent from ${ctx.school.name} today (${when}).`,
        "If you didn't expect this, please contact the school office.",
        ctx.school.phone ? `Office: ${ctx.school.phone}` : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
      relatedType: "attendance",
      relatedId: claimed.id,
    });
  }
}
