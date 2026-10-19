import "server-only";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { recordActivity } from "@/lib/activity";
import type { SchoolContext } from "@/lib/auth/context";
import { fullName } from "@/lib/format";
import {
  BOOK_CONDITIONS,
  MAX_PUSH,
  type Mutation,
  type MutationResult,
  type PullResponse,
  type SyncCopy,
  type SyncLearner,
} from "@/lib/offline/protocol";
import { getCurrentYear } from "./school-data";

const { learners, enrolments, classGroups, textbookCopies, textbookTitles, textbookLoans, syncMutations } = schema;

// Rows committed by a transaction that started before the last pull can carry
// an updated_at older than the cursor. Re-reading a window behind the cursor
// catches them; devices upsert, so repeats are harmless.
const OVERLAP_MS = 60_000;

export async function pull(ctx: SchoolContext, cursorParam: string | null): Promise<PullResponse> {
  const db = getDb();
  const schoolId = ctx.school.id;
  const serverNow = new Date();
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
          ? or(gt(learners.updatedAt, after), gt(enrolments.updatedAt, after), gt(classGroups.updatedAt, after))
          : and(isNull(learners.deletedAt), eq(learners.status, "active")),
      ),
    );

  const copyRows = await db
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
    );

  const loanRows = await db
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
    );

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
    learners: learnerOut,
    removedLearnerIds,
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
  };
}

function parseCursor(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const condition = z.enum(BOOK_CONDITIONS as [string, ...string[]]);
const mutationSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.uuid(),
    kind: z.literal("loan.issue"),
    at: z.iso.datetime({ offset: true }),
    payload: z.object({ loanId: z.uuid(), copyId: z.uuid(), learnerId: z.uuid(), conditionOut: condition }),
  }),
  z.object({
    id: z.uuid(),
    kind: z.literal("loan.return"),
    at: z.iso.datetime({ offset: true }),
    payload: z.object({
      copyId: z.uuid(),
      conditionIn: condition,
      outcome: z.enum(["returned", "lost", "damaged"]),
    }),
  }),
]);

export const pushSchema = z.object({
  deviceId: z.string().min(8).max(64),
  mutations: z.array(z.unknown()).max(MAX_PUSH),
});

class Rejected extends Error {}

// Applies queued desk actions in the order the device recorded them. Each one
// commits on its own, so one rejected book doesn't hold back the rest.
export async function push(ctx: SchoolContext, deviceId: string, raw: unknown[]): Promise<MutationResult[]> {
  const results: MutationResult[] = [];
  for (const item of raw) {
    const parsed = mutationSchema.safeParse(item);
    if (!parsed.success) {
      const id = typeof (item as { id?: unknown })?.id === "string" ? (item as { id: string }).id : "unknown";
      results.push({ id, status: "rejected", error: "Invalid change" });
      continue;
    }
    results.push(await applyOne(ctx, deviceId, parsed.data as Mutation));
  }
  return results;
}

async function applyOne(ctx: SchoolContext, deviceId: string, m: Mutation): Promise<MutationResult> {
  const db = getDb();
  const schoolId = ctx.school.id;
  // Offline clocks drift; never accept a time from the future.
  const at = new Date(Math.min(new Date(m.at).getTime(), Date.now()));

  try {
    const activity = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .insert(syncMutations)
        .values({ clientMutationId: m.id, schoolId, userId: ctx.user.id, deviceId, kind: m.kind })
        .onConflictDoNothing()
        .returning({ id: syncMutations.clientMutationId });
      if (!claimed) return "duplicate" as const;

      const [copy] = await tx
        .select({
          id: textbookCopies.id,
          copyNumber: textbookCopies.copyNumber,
          status: textbookCopies.status,
          title: textbookTitles.title,
        })
        .from(textbookCopies)
        .innerJoin(textbookTitles, eq(textbookTitles.id, textbookCopies.titleId))
        .where(
          and(
            eq(textbookCopies.schoolId, schoolId),
            eq(textbookCopies.id, m.payload.copyId),
            isNull(textbookCopies.deletedAt),
          ),
        )
        .for("update", { of: textbookCopies });
      if (!copy) throw new Rejected("Book not found");

      const [openLoan] = await tx
        .select({ id: textbookLoans.id, learnerId: textbookLoans.learnerId })
        .from(textbookLoans)
        .where(and(eq(textbookLoans.copyId, copy.id), isNull(textbookLoans.returnedAt)));

      if (m.kind === "loan.issue") {
        const [learner] = await tx
          .select({ id: learners.id, firstName: learners.firstName, lastName: learners.lastName })
          .from(learners)
          .where(and(eq(learners.schoolId, schoolId), eq(learners.id, m.payload.learnerId), isNull(learners.deletedAt)));
        if (!learner) throw new Rejected("Learner not found");
        if (openLoan) {
          if (openLoan.learnerId === learner.id) return null; // Already theirs; nothing to do.
          const [holder] = await tx
            .select({ firstName: learners.firstName, lastName: learners.lastName })
            .from(learners)
            .where(eq(learners.id, openLoan.learnerId));
          throw new Rejected(`Book ${copy.copyNumber} is already out with ${holder ? fullName(holder) : "another learner"}`);
        }
        if (copy.status === "lost" || copy.status === "written_off") {
          throw new Rejected(`Book ${copy.copyNumber} is marked ${copy.status.replace("_", " ")}`);
        }
        const year = await getCurrentYear(schoolId);
        await tx.insert(textbookLoans).values({
          id: m.payload.loanId,
          schoolId,
          copyId: copy.id,
          learnerId: learner.id,
          academicYearId: year?.id,
          issuedAt: at,
          issuedByStaffId: ctx.membership.staffId,
          conditionOut: m.payload.conditionOut as "good",
        });
        await tx
          .update(textbookCopies)
          .set({ status: "issued", condition: m.payload.conditionOut as "good" })
          .where(eq(textbookCopies.id, copy.id));
        return {
          action: "textbooks.issued",
          entityId: m.payload.loanId,
          subject: `${copy.title} #${copy.copyNumber} → ${fullName(learner)}`,
        };
      }

      if (!openLoan) throw new Rejected(`Book ${copy.copyNumber} isn't out with anyone`);
      const lost = m.payload.outcome === "lost";
      await tx
        .update(textbookLoans)
        .set({
          returnedAt: at,
          receivedByStaffId: ctx.membership.staffId,
          conditionIn: lost ? null : (m.payload.conditionIn as "good"),
          outcome: m.payload.outcome,
        })
        .where(eq(textbookLoans.id, openLoan.id));
      await tx
        .update(textbookCopies)
        .set(lost ? { status: "lost" } : { status: "available", condition: m.payload.conditionIn as "good" })
        .where(eq(textbookCopies.id, copy.id));
      return {
        action: lost ? "textbooks.lost" : "textbooks.returned",
        entityId: openLoan.id,
        subject: `${copy.title} #${copy.copyNumber}`,
      };
    });

    if (activity === "duplicate") return { id: m.id, status: "duplicate" };
    if (activity) {
      await recordActivity(ctx, {
        action: activity.action,
        entityType: "textbook_loan",
        entityId: activity.entityId,
        subject: activity.subject,
        deviceId,
        meta: { recordedAt: at.toISOString(), viaSync: true },
      });
    }
    return { id: m.id, status: "applied" };
  } catch (err) {
    if (err instanceof Rejected) return { id: m.id, status: "rejected", error: err.message };
    // Another device issued the same copy between our check and insert.
    const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") return { id: m.id, status: "rejected", error: "Book was just issued on another device" };
    console.error("[sync] mutation failed", m.kind, err);
    throw err;
  }
}
