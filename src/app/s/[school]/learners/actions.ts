"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db/client";
import type { FormState } from "@/components/action-form";
import { formToObject, schoolAction, UserFacingError } from "@/lib/actions";
import { diffFields, recordActivity } from "@/lib/activity";
import { fullName } from "@/lib/format";
import { uuidv7 } from "@/lib/ids";
import { learnerInput } from "@/lib/validation/people";
import { getCurrentYear, getLearner } from "@/server/school-data";

const { learners, enrolments, classGroups } = schema;

export async function createLearner(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const result = await schoolAction(slug, "learners.manage", async (ctx) => {
    const input = learnerInput.parse(formToObject(form));
    const db = getDb();
    const id = uuidv7();
    const { classGroupId, ...fields } = input;

    await db.transaction(async (tx) => {
      await tx.insert(learners).values({ id, schoolId: ctx.school.id, ...fields });
      if (classGroupId) await enrol(tx, ctx.school.id, id, classGroupId);
    });

    await recordActivity(ctx, {
      action: "learners.created",
      entityType: "learner",
      entityId: id,
      subject: fullName(input),
    });
    return id;
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/learners`);
  return { ok: true, redirectTo: `/s/${slug}/learners/${result.data}` };
}

export async function updateLearner(
  slug: string,
  learnerId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "learners.manage", async (ctx) => {
    const input = learnerInput.parse(formToObject(form));
    const current = await getLearner(ctx.school.id, learnerId);
    if (!current) throw new UserFacingError("Learner not found.");
    const { classGroupId, ...fields } = input;
    const patch = {
      ...fields,
      // Clear optional fields the form left empty.
      preferredName: fields.preferredName ?? null,
      admissionNumber: fields.admissionNumber ?? null,
      dateOfBirth: fields.dateOfBirth ?? null,
      gender: fields.gender ?? null,
      idNumber: fields.idNumber ?? null,
      homeLanguage: fields.homeLanguage ?? null,
      medicalNotes: fields.medicalNotes ?? null,
      notes: fields.notes ?? null,
    };

    const db = getDb();
    await db.transaction(async (tx) => {
      await tx
        .update(learners)
        .set(patch)
        .where(and(eq(learners.schoolId, ctx.school.id), eq(learners.id, learnerId)));
      if ((classGroupId ?? null) !== current.classGroupId) {
        if (current.enrolmentId) {
          await tx
            .update(enrolments)
            .set({ endedOn: new Date().toISOString().slice(0, 10) })
            .where(eq(enrolments.id, current.enrolmentId));
        }
        if (classGroupId) await enrol(tx, ctx.school.id, learnerId, classGroupId);
      }
    });

    const changes = diffFields(current.learner, patch, ["idNumber", "medicalNotes"]);
    if ((classGroupId ?? null) !== current.classGroupId) {
      changes.push({ field: "class", before: current.className, after: classGroupId ?? null });
    }
    await recordActivity(ctx, {
      action: "learners.updated",
      entityType: "learner",
      entityId: learnerId,
      subject: fullName(input),
      changes,
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/learners`);
  return { ok: true, redirectTo: `/s/${slug}/learners/${learnerId}` };
}

export async function deleteLearner(slug: string, learnerId: string): Promise<FormState> {
  const result = await schoolAction(slug, "learners.manage", async (ctx) => {
    const current = await getLearner(ctx.school.id, learnerId);
    if (!current) throw new UserFacingError("Learner not found.");
    const [openLoan] = await getDb()
      .select({ id: schema.textbookLoans.id })
      .from(schema.textbookLoans)
      .where(and(eq(schema.textbookLoans.learnerId, learnerId), isNull(schema.textbookLoans.returnedAt)))
      .limit(1);
    if (openLoan) throw new UserFacingError("This learner still has textbooks out. Return them first.");

    await getDb()
      .update(learners)
      .set({ deletedAt: new Date() })
      .where(and(eq(learners.schoolId, ctx.school.id), eq(learners.id, learnerId)));
    await recordActivity(ctx, {
      action: "learners.deleted",
      entityType: "learner",
      entityId: learnerId,
      subject: fullName(current.learner),
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/learners`);
  return { ok: true, redirectTo: `/s/${slug}/learners` };
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

async function enrol(tx: Tx, schoolId: string, learnerId: string, classGroupId: string) {
  const year = await getCurrentYear(schoolId);
  const [klass] = await tx
    .select({ id: classGroups.id, academicYearId: classGroups.academicYearId })
    .from(classGroups)
    .where(and(eq(classGroups.schoolId, schoolId), eq(classGroups.id, classGroupId)))
    .limit(1);
  if (!klass || klass.academicYearId !== year?.id) {
    throw new UserFacingError("Pick a class from the current academic year.");
  }
  await tx.insert(enrolments).values({
    id: uuidv7(),
    schoolId,
    learnerId,
    classGroupId,
    academicYearId: klass.academicYearId,
  });
}
