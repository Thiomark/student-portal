import "server-only";
import { and, asc, eq, gt, gte, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { recordActivity } from "@/lib/activity";
import { can, type SchoolContext } from "@/lib/auth/context";
import { schoolToday, shiftDate } from "@/lib/format";
import {
  ATTENDANCE_DAYS,
  MAX_PUSH,
  type MutationResult,
  type PullResponse,
  type SyncCopy,
  type SyncLearner,
  type SyncScope,
} from "@/lib/offline/protocol";
import type { Capability } from "@/lib/permissions";
import { getCurrentYear } from "../school-data";
import { applyRegister, registerPayload } from "./attendance";
import { Rejected, type Applied } from "./common";
import { applyLoan, issuePayload, returnPayload } from "./textbooks";

// Offline sync for the textbook desk and attendance registers. GET pulls a
// snapshot (or the changes since a cursor) into the device; POST applies the
// changes the device queued while offline.

const {
  learners,
  enrolments,
  classGroups,
  grades,
  textbookCopies,
  textbookTitles,
  textbookLoans,
  attendanceRegisters,
  attendanceRecords,
  syncMutations,
} = schema;

// Rows committed by a transaction that started before the last pull can carry
// an updated_at older than the cursor. Re-reading a window behind the cursor
// catches them; devices upsert, so repeats are harmless.
const OVERLAP_MS = 60_000;

export function syncScope(ctx: SchoolContext): SyncScope {
  return { textbooks: can(ctx, "textbooks.issue"), attendance: can(ctx, "attendance.take") };
}

export async function pull(ctx: SchoolContext, cursorParam: string | null): Promise<PullResponse> {
  const db = getDb();
  const schoolId = ctx.school.id;
  const scope = syncScope(ctx);
  const serverNow = new Date();
  const today = schoolToday(ctx.school.timezone, serverNow);
  const since = parseCursor(cursorParam);
  const full = since === null;
  const after = full ? null : new Date(since.getTime() - OVERLAP_MS);
  const year = await getCurrentYear(schoolId);

  const learnerRows = await db
    .select({
      id: learners.id,
      firstName: learners.firstName,
      lastName: learners.lastName,
      preferredName: learners.preferredName,
      admissionNumber: learners.admissionNumber,
      status: learners.status,
      deletedAt: learners.deletedAt,
      classGroupId: classGroups.id,
      className: classGroups.name,
    })
    .from(learners)
    .leftJoin(
      enrolments,
      and(
        eq(enrolments.learnerId, learners.id),
        isNull(enrolments.endedOn),
        year ? eq(enrolments.academicYearId, year.id) : sql`false`,
      ),
    )
    .leftJoin(classGroups, eq(classGroups.id, enrolments.classGroupId))
    .where(
      and(
        eq(learners.schoolId, schoolId),
        after
          ? or(
              gt(learners.updatedAt, after),
              gt(classGroups.updatedAt, after),
              // Also catches a learner taken out of a class with no new one.
              sql`exists (select 1 from ${enrolments} e where e.learner_id = "learners"."id" and e.updated_at > ${after})`,
            )
          : and(isNull(learners.deletedAt), eq(learners.status, "active")),
      ),
    );

  const classRows = await db
    .select({
      id: classGroups.id,
      name: classGroups.name,
      gradeName: grades.name,
      gradeSort: grades.sortOrder,
      teacherStaffId: classGroups.teacherId,
    })
    .from(classGroups)
    .innerJoin(grades, eq(grades.id, classGroups.gradeId))
    .where(
      and(
        eq(classGroups.schoolId, schoolId),
        year ? eq(classGroups.academicYearId, year.id) : sql`false`,
        isNull(classGroups.deletedAt),
      ),
    )
    .orderBy(asc(grades.sortOrder), asc(classGroups.name));

  const [copyRows, loanRows] = scope.textbooks
    ? await Promise.all([
        db
          .select({
            id: textbookCopies.id,
            copyNumber: textbookCopies.copyNumber,
            titleId: textbookCopies.titleId,
            title: textbookTitles.title,
            condition: textbookCopies.condition,
            status: textbookCopies.status,
            deletedAt: textbookCopies.deletedAt,
          })
          .from(textbookCopies)
          .innerJoin(textbookTitles, eq(textbookTitles.id, textbookCopies.titleId))
          .where(
            and(
              eq(textbookCopies.schoolId, schoolId),
              after
                ? or(gt(textbookCopies.updatedAt, after), gt(textbookTitles.updatedAt, after))
                : isNull(textbookCopies.deletedAt),
            ),
          ),
        db
          .select({
            id: textbookLoans.id,
            copyId: textbookLoans.copyId,
            learnerId: textbookLoans.learnerId,
            issuedAt: textbookLoans.issuedAt,
            conditionOut: textbookLoans.conditionOut,
            returnedAt: textbookLoans.returnedAt,
          })
          .from(textbookLoans)
          .where(
            and(
              eq(textbookLoans.schoolId, schoolId),
              after ? gt(textbookLoans.updatedAt, after) : isNull(textbookLoans.returnedAt),
            ),
          ),
      ])
    : [[], []];

  const firstDay = shiftDate(today, -ATTENDANCE_DAYS);
  const [registerRows, attendanceRows] = scope.attendance
    ? await Promise.all([
        db
          .select({
            id: attendanceRegisters.id,
            classGroupId: attendanceRegisters.classGroupId,
            date: attendanceRegisters.date,
            takenAt: attendanceRegisters.takenAt,
          })
          .from(attendanceRegisters)
          .where(
            and(
              eq(attendanceRegisters.schoolId, schoolId),
              gte(attendanceRegisters.date, firstDay),
              after ? gt(attendanceRegisters.updatedAt, after) : undefined,
            ),
          ),
        db
          .select({
            learnerId: attendanceRecords.learnerId,
            date: attendanceRecords.date,
            status: attendanceRecords.status,
            reason: attendanceRecords.reason,
          })
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.schoolId, schoolId),
              gte(attendanceRecords.date, firstDay),
              after ? gt(attendanceRecords.updatedAt, after) : undefined,
            ),
          ),
      ])
    : [[], []];

  const learnerOut: SyncLearner[] = [];
  const removedLearnerIds: string[] = [];
  for (const l of learnerRows) {
    if (l.deletedAt || l.status !== "active") {
      removedLearnerIds.push(l.id);
      continue;
    }
    learnerOut.push({
      id: l.id,
      firstName: l.firstName,
      lastName: l.lastName,
      preferredName: l.preferredName,
      admissionNumber: l.admissionNumber,
      classGroupId: l.classGroupId,
      className: l.className,
      search: [l.firstName, l.lastName, l.preferredName, l.admissionNumber].filter(Boolean).join(" ").toLowerCase(),
    });
  }

  const copyOut: SyncCopy[] = [];
  const removedCopyIds: string[] = [];
  for (const c of copyRows) {
    if (c.deletedAt) {
      removedCopyIds.push(c.id);
      continue;
    }
    copyOut.push({
      id: c.id,
      copyNumber: c.copyNumber,
      key: c.copyNumber.toUpperCase(),
      titleId: c.titleId,
      title: c.title,
      condition: c.condition,
      status: c.status,
    });
  }

  return {
    cursor: serverNow.toISOString(),
    full,
    scope,
    today,
    learners: learnerOut,
    removedLearnerIds,
    classes: classRows,
    copies: copyOut,
    removedCopyIds,
    loans: loanRows
      .filter((l) => !l.returnedAt)
      .map((l) => ({
        id: l.id,
        copyId: l.copyId,
        learnerId: l.learnerId,
        issuedAt: l.issuedAt.toISOString(),
        conditionOut: l.conditionOut,
      })),
    closedLoanIds: loanRows.filter((l) => l.returnedAt).map((l) => l.id),
    registers: registerRows.map((r) => ({ ...r, takenAt: r.takenAt.toISOString() })),
    attendance: attendanceRows.map((a) => ({ key: `${a.learnerId}:${a.date}`, ...a })),
  };
}

function parseCursor(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const envelope = { id: z.uuid(), at: z.iso.datetime({ offset: true }) };
const mutationSchema = z.discriminatedUnion("kind", [
  z.object({ ...envelope, kind: z.literal("loan.issue"), payload: issuePayload }),
  z.object({ ...envelope, kind: z.literal("loan.return"), payload: returnPayload }),
  z.object({ ...envelope, kind: z.literal("attendance.submit"), payload: registerPayload }),
]);
type ParsedMutation = z.infer<typeof mutationSchema>;

const NEEDS: Record<ParsedMutation["kind"], Capability> = {
  "loan.issue": "textbooks.issue",
  "loan.return": "textbooks.issue",
  "attendance.submit": "attendance.take",
};

export const pushSchema = z.object({
  deviceId: z.string().min(8).max(64),
  mutations: z.array(z.unknown()).max(MAX_PUSH),
});

// Applies queued changes in the order the device recorded them. Each one
// commits on its own, so one rejected change doesn't hold back the rest.
export async function push(ctx: SchoolContext, deviceId: string, raw: unknown[]): Promise<MutationResult[]> {
  const results: MutationResult[] = [];
  for (const item of raw) {
    const parsed = mutationSchema.safeParse(item);
    if (!parsed.success) {
      const id = typeof (item as { id?: unknown })?.id === "string" ? (item as { id: string }).id : "unknown";
      results.push({ id, status: "rejected", error: "Invalid change" });
      continue;
    }
    if (!can(ctx, NEEDS[parsed.data.kind])) {
      results.push({ id: parsed.data.id, status: "rejected", error: "You don't have permission to do that" });
      continue;
    }
    results.push(await applyOne(ctx, deviceId, parsed.data));
  }
  return results;
}

async function applyOne(ctx: SchoolContext, deviceId: string, m: ParsedMutation): Promise<MutationResult> {
  const db = getDb();
  const schoolId = ctx.school.id;
  // Offline clocks drift; never accept a time from the future.
  const at = new Date(Math.min(new Date(m.at).getTime(), Date.now()));

  try {
    const applied = await db.transaction(async (tx): Promise<Applied | "duplicate"> => {
      const [claimed] = await tx
        .insert(syncMutations)
        .values({ clientMutationId: m.id, schoolId, userId: ctx.user.id, deviceId, kind: m.kind })
        .onConflictDoNothing()
        .returning({ id: syncMutations.clientMutationId });
      if (!claimed) return "duplicate";
      return m.kind === "attendance.submit" ? applyRegister(tx, ctx, m.payload, at) : applyLoan(tx, ctx, m, at);
    });

    if (applied === "duplicate") return { id: m.id, status: "duplicate" };
    if (applied?.activity) {
      await recordActivity(ctx, {
        ...applied.activity,
        deviceId,
        meta: { ...applied.activity.meta, recordedAt: at.toISOString(), viaSync: true },
      });
    }
    // Telling parents never undoes a saved change.
    await applied?.afterCommit?.().catch((err) => console.error("[sync] after-commit step failed", m.kind, err));
    return { id: m.id, status: "applied" };
  } catch (err) {
    if (err instanceof Rejected) return { id: m.id, status: "rejected", error: err.message };
    // Another device issued the same copy between our check and insert.
    const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505" && m.kind === "loan.issue") {
      return { id: m.id, status: "rejected", error: "Book was just issued on another device" };
    }
    console.error("[sync] mutation failed", m.kind, err);
    throw err;
  }
}
