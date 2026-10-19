import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db/client";
import type { SchoolContext } from "@/lib/auth/context";
import { fullName } from "@/lib/format";
import { BOOK_CONDITIONS } from "@/lib/offline/protocol";
import { getCurrentYear } from "../school-data";
import { Rejected, type Applied, type Tx } from "./common";

const { learners, textbookCopies, textbookTitles, textbookLoans } = schema;

const condition = z.enum(BOOK_CONDITIONS as [string, ...string[]]);

export const issuePayload = z.object({
  loanId: z.uuid(),
  copyId: z.uuid(),
  learnerId: z.uuid(),
  conditionOut: condition,
});

export const returnPayload = z.object({
  copyId: z.uuid(),
  conditionIn: condition,
  outcome: z.enum(["returned", "lost", "damaged"]),
});

type Loan =
  | { kind: "loan.issue"; payload: z.infer<typeof issuePayload> }
  | { kind: "loan.return"; payload: z.infer<typeof returnPayload> };

export async function applyLoan(tx: Tx, ctx: SchoolContext, m: Loan, at: Date): Promise<Applied> {
  const schoolId = ctx.school.id;
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
      activity: {
        action: "textbooks.issued",
        entityType: "textbook_loan",
        entityId: m.payload.loanId,
        subject: `${copy.title} #${copy.copyNumber} → ${fullName(learner)}`,
      },
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
    activity: {
      action: lost ? "textbooks.lost" : "textbooks.returned",
      entityType: "textbook_loan",
      entityId: openLoan.id,
      subject: `${copy.title} #${copy.copyNumber}`,
    },
  };
}
