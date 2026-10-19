"use server";

import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/action-form";
import { getDb, schema } from "@/db/client";
import { formToObject, schoolAction, UserFacingError } from "@/lib/actions";
import { diffFields, recordActivity } from "@/lib/activity";
import { uuidv7 } from "@/lib/ids";
import { academicYearInput, classGroupInput, gradeInput, subjectInput } from "@/lib/validation/classes";
import { getAcademicYear, getClassGroup, getGrade, getSubject } from "@/server/classes";
import { getCurrentYear } from "@/server/school-data";

const { academicYears, grades, classGroups, staff, subjects } = schema;

// Promoting learners into next year's classes ("roll over") is not built yet.
// For now the office creates the new year's classes and moves each learner
// from their own page.

// ── Academic years ──────────────────────────────────────────────────────────

export async function createAcademicYear(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const result = await schoolAction(slug, "classes.manage", async (ctx) => {
    const input = academicYearInput.parse(formToObject(form));
    const id = uuidv7();
    const current = await getCurrentYear(ctx.school.id);
    // The first year a school sets up becomes current without asking.
    const makeCurrent = input.isCurrent || !current;

    await getDb().transaction(async (tx) => {
      if (makeCurrent) {
        await tx
          .update(academicYears)
          .set({ isCurrent: false })
          .where(and(eq(academicYears.schoolId, ctx.school.id), eq(academicYears.isCurrent, true)));
      }
      await tx.insert(academicYears).values({
        id,
        schoolId: ctx.school.id,
        name: input.name,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        isCurrent: makeCurrent,
      });
    });

    await recordActivity(ctx, {
      action: "classes.year_created",
      entityType: "academic_year",
      entityId: id,
      subject: input.name,
      meta: { isCurrent: makeCurrent },
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/classes/years`);
  revalidatePath(`/s/${slug}/classes`);
  return { ok: true, message: "Academic year added." };
}

export async function setCurrentYear(slug: string, yearId: string): Promise<FormState> {
  const result = await schoolAction(slug, "classes.manage", async (ctx) => {
    const year = await getAcademicYear(ctx.school.id, yearId);
    if (!year) throw new UserFacingError("Academic year not found.");
    if (year.isCurrent) return;
    const previous = await getCurrentYear(ctx.school.id);

    // Only one current year per school (partial unique index): clear the old
    // one first, in the same transaction.
    await getDb().transaction(async (tx) => {
      await tx
        .update(academicYears)
        .set({ isCurrent: false })
        .where(
          and(
            eq(academicYears.schoolId, ctx.school.id),
            eq(academicYears.isCurrent, true),
            ne(academicYears.id, yearId),
          ),
        );
      await tx
        .update(academicYears)
        .set({ isCurrent: true })
        .where(and(eq(academicYears.schoolId, ctx.school.id), eq(academicYears.id, yearId)));
    });

    await recordActivity(ctx, {
      action: "classes.year_made_current",
      entityType: "academic_year",
      entityId: yearId,
      subject: year.name,
      changes: [{ field: "currentYear", before: previous?.name ?? null, after: year.name }],
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/classes/years`);
  revalidatePath(`/s/${slug}/classes`);
  return { ok: true, message: "Current year changed." };
}

// ── Grades ──────────────────────────────────────────────────────────────────

export async function createGrade(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const result = await schoolAction(slug, "classes.manage", async (ctx) => {
    const input = gradeInput.parse(formToObject(form));
    const db = getDb();
    // The name index includes removed grades; bring one back instead of
    // failing on the duplicate.
    const [removed] = await db
      .select({ id: grades.id })
      .from(grades)
      .where(and(eq(grades.schoolId, ctx.school.id), eq(grades.name, input.name), isNotNull(grades.deletedAt)))
      .limit(1);

    const id = removed?.id ?? uuidv7();
    if (removed) {
      await db
        .update(grades)
        .set({ deletedAt: null, sortOrder: input.sortOrder })
        .where(and(eq(grades.schoolId, ctx.school.id), eq(grades.id, id)));
    } else {
      await db.insert(grades).values({ id, schoolId: ctx.school.id, ...input });
    }

    await recordActivity(ctx, {
      action: "classes.grade_created",
      entityType: "grade",
      entityId: id,
      subject: input.name,
      meta: removed ? { restored: true } : undefined,
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/classes/grades`);
  return { ok: true, message: "Grade added." };
}

export async function updateGrade(
  slug: string,
  gradeId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "classes.manage", async (ctx) => {
    const input = gradeInput.parse(formToObject(form));
    const current = await getGrade(ctx.school.id, gradeId);
    if (!current) throw new UserFacingError("Grade not found.");
    await getDb()
      .update(grades)
      .set(input)
      .where(and(eq(grades.schoolId, ctx.school.id), eq(grades.id, gradeId)));
    await recordActivity(ctx, {
      action: "classes.grade_updated",
      entityType: "grade",
      entityId: gradeId,
      subject: input.name,
      changes: diffFields(current, input),
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/classes/grades`);
  return { ok: true, message: "Saved." };
}

export async function deleteGrade(slug: string, gradeId: string): Promise<FormState> {
  const result = await schoolAction(slug, "classes.manage", async (ctx) => {
    const current = await getGrade(ctx.school.id, gradeId);
    if (!current) throw new UserFacingError("Grade not found.");
    const db = getDb();
    await db.transaction(async (tx) => {
      const [inUse] = await tx
        .select({ id: classGroups.id })
        .from(classGroups)
        .where(
          and(
            eq(classGroups.schoolId, ctx.school.id),
            eq(classGroups.gradeId, gradeId),
            isNull(classGroups.deletedAt),
          ),
        )
        .limit(1);
      if (inUse) throw new UserFacingError("Classes still use this grade, so it can't be removed.");
      await tx
        .update(grades)
        .set({ deletedAt: new Date() })
        .where(and(eq(grades.schoolId, ctx.school.id), eq(grades.id, gradeId)));
    });
    await recordActivity(ctx, {
      action: "classes.grade_deleted",
      entityType: "grade",
      entityId: gradeId,
      subject: current.name,
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/classes/grades`);
  return { ok: true };
}

// ── Classes ─────────────────────────────────────────────────────────────────

async function checkRefs(schoolId: string, gradeId: string, teacherId: string | undefined) {
  const db = getDb();
  const [grade, teacher] = await Promise.all([
    getGrade(schoolId, gradeId),
    teacherId
      ? db
          .select({ id: staff.id })
          .from(staff)
          .where(and(eq(staff.schoolId, schoolId), eq(staff.id, teacherId), isNull(staff.deletedAt)))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
  ]);
  if (!grade) throw new UserFacingError("Pick a grade from the list.");
  if (teacherId && !teacher) throw new UserFacingError("Pick a teacher from the staff list.");
  return grade;
}

export async function createClassGroup(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const result = await schoolAction(slug, "classes.manage", async (ctx) => {
    const input = classGroupInput.parse(formToObject(form));
    const year = await getCurrentYear(ctx.school.id);
    if (!year) throw new UserFacingError("Set up the current academic year first.");
    const grade = await checkRefs(ctx.school.id, input.gradeId, input.teacherId);

    const id = uuidv7();
    await getDb()
      .insert(classGroups)
      .values({
        id,
        schoolId: ctx.school.id,
        academicYearId: year.id,
        gradeId: input.gradeId,
        name: input.name,
        teacherId: input.teacherId ?? null,
        room: input.room ?? null,
      });

    await recordActivity(ctx, {
      action: "classes.created",
      entityType: "class_group",
      entityId: id,
      subject: `${input.name} (${grade.name}, ${year.name})`,
    });
    return id;
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/classes`);
  return { ok: true, redirectTo: `/s/${slug}/classes/${result.data}` };
}

export async function updateClassGroup(
  slug: string,
  classGroupId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "classes.manage", async (ctx) => {
    const input = classGroupInput.parse(formToObject(form));
    const current = await getClassGroup(ctx.school.id, classGroupId);
    if (!current) throw new UserFacingError("Class not found.");
    await checkRefs(ctx.school.id, input.gradeId, input.teacherId);

    const patch = {
      name: input.name,
      gradeId: input.gradeId,
      teacherId: input.teacherId ?? null,
      room: input.room ?? null,
    };
    await getDb()
      .update(classGroups)
      .set(patch)
      .where(and(eq(classGroups.schoolId, ctx.school.id), eq(classGroups.id, classGroupId)));

    await recordActivity(ctx, {
      action: "classes.updated",
      entityType: "class_group",
      entityId: classGroupId,
      subject: `${input.name} (${current.yearName})`,
      changes: diffFields(current.classGroup, patch),
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/classes`);
  revalidatePath(`/s/${slug}/classes/${classGroupId}`);
  return { ok: true, redirectTo: `/s/${slug}/classes/${classGroupId}` };
}

// ── Subjects ────────────────────────────────────────────────────────────────

export async function createSubject(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const result = await schoolAction(slug, "classes.manage", async (ctx) => {
    const input = subjectInput.parse(formToObject(form));
    const id = uuidv7();
    await getDb()
      .insert(subjects)
      .values({ id, schoolId: ctx.school.id, name: input.name, code: input.code ?? null });
    await recordActivity(ctx, {
      action: "classes.subject_created",
      entityType: "subject",
      entityId: id,
      subject: input.name,
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/classes/subjects`);
  return { ok: true, message: "Subject added." };
}

export async function updateSubject(
  slug: string,
  subjectId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "classes.manage", async (ctx) => {
    const input = subjectInput.parse(formToObject(form));
    const current = await getSubject(ctx.school.id, subjectId);
    if (!current) throw new UserFacingError("Subject not found.");
    const patch = { name: input.name, code: input.code ?? null };
    await getDb()
      .update(subjects)
      .set(patch)
      .where(and(eq(subjects.schoolId, ctx.school.id), eq(subjects.id, subjectId)));
    await recordActivity(ctx, {
      action: "classes.subject_updated",
      entityType: "subject",
      entityId: subjectId,
      subject: input.name,
      changes: diffFields(current, patch),
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/classes/subjects`);
  return { ok: true, message: "Saved." };
}
