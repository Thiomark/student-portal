"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/action-form";
import { getDb, schema } from "@/db/client";
import { formToObject, schoolAction, UserFacingError } from "@/lib/actions";
import { diffFields, recordActivity } from "@/lib/activity";
import { fullName } from "@/lib/format";
import { uuidv7 } from "@/lib/ids";
import {
  addCopiesInput,
  copyNumbersFor,
  copyStatusInput,
  copyUpdateInput,
  textbookTitleInput,
  type TextbookTitleInput,
} from "@/lib/validation/textbooks";
import { getCopy, getTitle } from "@/server/textbooks";

const { textbookTitles, textbookCopies, textbookLoans, grades, subjects, learners } = schema;

// Issuing and returning happen at the textbook desk (/s/[school]/desk); this
// module only manages titles and stock.

async function checkTitleRefs(schoolId: string, input: TextbookTitleInput) {
  const db = getDb();
  const [grade, subject] = await Promise.all([
    input.gradeId
      ? db
          .select({ id: grades.id })
          .from(grades)
          .where(and(eq(grades.schoolId, schoolId), eq(grades.id, input.gradeId), isNull(grades.deletedAt)))
          .limit(1)
      : Promise.resolve([{ id: null }]),
    input.subjectId
      ? db
          .select({ id: subjects.id })
          .from(subjects)
          .where(and(eq(subjects.schoolId, schoolId), eq(subjects.id, input.subjectId), isNull(subjects.deletedAt)))
          .limit(1)
      : Promise.resolve([{ id: null }]),
  ]);
  if (!grade.length) throw new UserFacingError("Pick a grade from the list.");
  if (!subject.length) throw new UserFacingError("Pick a subject from the list.");
}

function titlePatch(input: TextbookTitleInput) {
  return {
    title: input.title,
    subjectId: input.subjectId ?? null,
    gradeId: input.gradeId ?? null,
    isbn: input.isbn || null,
    publisher: input.publisher ?? null,
    edition: input.edition ?? null,
  };
}

export async function createTitle(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const result = await schoolAction(slug, "textbooks.manage", async (ctx) => {
    const input = textbookTitleInput.parse(formToObject(form));
    await checkTitleRefs(ctx.school.id, input);
    const id = uuidv7();
    await getDb()
      .insert(textbookTitles)
      .values({ id, schoolId: ctx.school.id, ...titlePatch(input) });
    await recordActivity(ctx, {
      action: "textbooks.title_created",
      entityType: "textbook_title",
      entityId: id,
      subject: input.title,
    });
    return id;
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/textbooks`);
  return { ok: true, redirectTo: `/s/${slug}/textbooks/${result.data}` };
}

export async function updateTitle(
  slug: string,
  titleId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "textbooks.manage", async (ctx) => {
    const input = textbookTitleInput.parse(formToObject(form));
    const current = await getTitle(ctx.school.id, titleId);
    if (!current) throw new UserFacingError("Textbook not found.");
    await checkTitleRefs(ctx.school.id, input);
    const patch = titlePatch(input);
    await getDb()
      .update(textbookTitles)
      .set(patch)
      .where(and(eq(textbookTitles.schoolId, ctx.school.id), eq(textbookTitles.id, titleId)));
    await recordActivity(ctx, {
      action: "textbooks.title_updated",
      entityType: "textbook_title",
      entityId: titleId,
      subject: input.title,
      changes: diffFields(current.title, patch),
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/textbooks`);
  revalidatePath(`/s/${slug}/textbooks/${titleId}`);
  return { ok: true, redirectTo: `/s/${slug}/textbooks/${titleId}` };
}

// Adds one copy or a numbered range. Numbers that already exist anywhere in
// the school (the unique index is on upper(copy_number)) are skipped, so a
// range can be re-run safely after a partial label print.
export async function addCopies(
  slug: string,
  titleId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "textbooks.manage", async (ctx) => {
    const input = addCopiesInput.parse(formToObject(form));
    const title = await getTitle(ctx.school.id, titleId);
    if (!title) throw new UserFacingError("Textbook not found.");
    const numbers = copyNumbersFor(input);

    const inserted = await getDb()
      .insert(textbookCopies)
      .values(
        numbers.map((copyNumber) => ({
          id: uuidv7(),
          schoolId: ctx.school.id,
          titleId,
          copyNumber,
          condition: input.condition,
          acquiredOn: input.acquiredOn ?? null,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: textbookCopies.id });

    const created = inserted.length;
    const skipped = numbers.length - created;
    if (input.mode === "single" && created === 0) {
      throw new UserFacingError(`Copy number ${input.copyNumber} is already in use.`);
    }

    await recordActivity(ctx, {
      action: "textbooks.copies_added",
      entityType: "textbook_title",
      entityId: titleId,
      subject: title.title.title,
      meta: {
        created,
        skipped,
        first: numbers[0],
        last: numbers[numbers.length - 1],
      },
    });
    return { created, skipped };
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/textbooks`);
  revalidatePath(`/s/${slug}/textbooks/${titleId}`);
  const { created, skipped } = result.data;
  const plural = (n: number) => (n === 1 ? "copy" : "copies");
  return {
    ok: true,
    message:
      skipped === 0
        ? `Added ${created} ${plural(created)}.`
        : `Added ${created} ${plural(created)}. Skipped ${skipped} ${skipped === 1 ? "number that is" : "numbers that are"} already in use.`,
  };
}

export async function updateCopy(
  slug: string,
  copyId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "textbooks.manage", async (ctx) => {
    const input = copyUpdateInput.parse(formToObject(form));
    const current = await getCopy(ctx.school.id, copyId);
    if (!current) throw new UserFacingError("Copy not found.");
    const patch = { condition: input.condition, acquiredOn: input.acquiredOn ?? null, notes: input.notes ?? null };
    await getDb()
      .update(textbookCopies)
      .set(patch)
      .where(and(eq(textbookCopies.schoolId, ctx.school.id), eq(textbookCopies.id, copyId)));
    await recordActivity(ctx, {
      action: "textbooks.copy_updated",
      entityType: "textbook_copy",
      entityId: copyId,
      subject: `${current.copy.copyNumber} (${current.titleName})`,
      changes: diffFields(current.copy, patch),
    });
    return current.copy.titleId;
  });
  if (!result.ok) return result;
  revalidateCopy(slug, result.data, copyId);
  return { ok: true, message: "Saved." };
}

const STATUS_ACTIONS = {
  lost: "textbooks.copy_marked_lost",
  written_off: "textbooks.copy_written_off",
  available: "textbooks.copy_restored",
} as const;

// Lost / written off / back in stock. A copy that is out on loan has to come
// back through the desk first, so the loan is closed with the right outcome.
export async function setCopyStatus(
  slug: string,
  copyId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "textbooks.manage", async (ctx) => {
    const input = copyStatusInput.parse(formToObject(form));
    const db = getDb();

    const outcome = await db.transaction(async (tx) => {
      // Lock the copy so the desk can't issue it while we change its status.
      const [copy] = await tx
        .select({
          id: textbookCopies.id,
          titleId: textbookCopies.titleId,
          copyNumber: textbookCopies.copyNumber,
          status: textbookCopies.status,
          notes: textbookCopies.notes,
        })
        .from(textbookCopies)
        .where(
          and(
            eq(textbookCopies.schoolId, ctx.school.id),
            eq(textbookCopies.id, copyId),
            isNull(textbookCopies.deletedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!copy) throw new UserFacingError("Copy not found.");

      const [openLoan] = await tx
        .select({ firstName: learners.firstName, lastName: learners.lastName, preferredName: learners.preferredName })
        .from(textbookLoans)
        .innerJoin(learners, eq(learners.id, textbookLoans.learnerId))
        .where(
          and(
            eq(textbookLoans.schoolId, ctx.school.id),
            eq(textbookLoans.copyId, copyId),
            isNull(textbookLoans.returnedAt),
          ),
        )
        .limit(1);
      if (openLoan || copy.status === "issued") {
        throw new UserFacingError(
          `${copy.copyNumber} is out${openLoan ? ` with ${fullName(openLoan)}` : ""}. Return it at the textbook desk first; mark it lost there if it isn't coming back.`,
        );
      }
      if (copy.status === input.status) return { copy, changed: false };

      await tx
        .update(textbookCopies)
        .set({ status: input.status, notes: input.notes ?? copy.notes })
        .where(and(eq(textbookCopies.schoolId, ctx.school.id), eq(textbookCopies.id, copyId)));
      return { copy, changed: true };
    });

    if (outcome.changed) {
      await recordActivity(ctx, {
        action: STATUS_ACTIONS[input.status],
        entityType: "textbook_copy",
        entityId: copyId,
        subject: outcome.copy.copyNumber,
        changes: [{ field: "status", before: outcome.copy.status, after: input.status }],
      });
    }
    return outcome.copy.titleId;
  });
  if (!result.ok) return result;
  revalidateCopy(slug, result.data, copyId);
  return { ok: true, message: "Status updated." };
}

function revalidateCopy(slug: string, titleId: string, copyId: string) {
  revalidatePath(`/s/${slug}/textbooks`);
  revalidatePath(`/s/${slug}/textbooks/loans`);
  revalidatePath(`/s/${slug}/textbooks/${titleId}`);
  revalidatePath(`/s/${slug}/textbooks/${titleId}/copies/${copyId}`);
}
