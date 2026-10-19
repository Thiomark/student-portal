import "server-only";
import { and, asc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

const { learners, enrolments, classGroups, grades, academicYears, guardians, guardianContacts, learnerGuardians } =
  schema;

export async function getCurrentYear(schoolId: string) {
  const [year] = await getDb()
    .select()
    .from(academicYears)
    .where(and(eq(academicYears.schoolId, schoolId), eq(academicYears.isCurrent, true)))
    .limit(1);
  return year ?? null;
}

// Classes for the current academic year, ordered by grade then name.
export async function listCurrentClasses(schoolId: string) {
  const year = await getCurrentYear(schoolId);
  if (!year) return [];
  return getDb()
    .select({
      id: classGroups.id,
      name: classGroups.name,
      gradeId: classGroups.gradeId,
      gradeName: grades.name,
    })
    .from(classGroups)
    .innerJoin(grades, eq(grades.id, classGroups.gradeId))
    .where(
      and(
        eq(classGroups.schoolId, schoolId),
        eq(classGroups.academicYearId, year.id),
        isNull(classGroups.deletedAt),
      ),
    )
    .orderBy(asc(grades.sortOrder), asc(classGroups.name));
}

// The open enrolment in the current year, joined in as the learner's class.
function currentClassJoin(yearId: string | null) {
  return and(
    eq(enrolments.learnerId, learners.id),
    isNull(enrolments.endedOn),
    yearId ? eq(enrolments.academicYearId, yearId) : sql`false`,
  );
}

export const PAGE_SIZE = 50;

export async function listLearners(
  schoolId: string,
  opts: { q?: string; classGroupId?: string; status?: string; page?: number },
) {
  const year = await getCurrentYear(schoolId);
  const where: SQL[] = [eq(learners.schoolId, schoolId), isNull(learners.deletedAt)];
  if (opts.q) {
    const term = `%${opts.q.replace(/[%_]/g, "")}%`;
    where.push(
      or(
        ilike(learners.firstName, term),
        ilike(learners.lastName, term),
        ilike(learners.preferredName, term),
        ilike(learners.admissionNumber, term),
        sql`(${learners.firstName} || ' ' || ${learners.lastName}) ilike ${term}`,
      )!,
    );
  }
  if (opts.status) where.push(eq(learners.status, opts.status as "active"));
  if (opts.classGroupId) where.push(eq(enrolments.classGroupId, opts.classGroupId));

  const page = Math.max(1, opts.page ?? 1);
  const rows = await getDb()
    .select({
      id: learners.id,
      firstName: learners.firstName,
      lastName: learners.lastName,
      preferredName: learners.preferredName,
      admissionNumber: learners.admissionNumber,
      status: learners.status,
      className: classGroups.name,
      guardianCount: sql<number>`(select count(*)::int from ${learnerGuardians} lg where lg.learner_id = "learners"."id")`,
    })
    .from(learners)
    .leftJoin(enrolments, currentClassJoin(year?.id ?? null))
    .leftJoin(classGroups, eq(classGroups.id, enrolments.classGroupId))
    .where(and(...where))
    .orderBy(asc(learners.lastName), asc(learners.firstName))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);

  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, page };
}

export async function getLearner(schoolId: string, learnerId: string) {
  const year = await getCurrentYear(schoolId);
  const [row] = await getDb()
    .select({
      learner: learners,
      classGroupId: classGroups.id,
      className: classGroups.name,
      enrolmentId: enrolments.id,
    })
    .from(learners)
    .leftJoin(enrolments, currentClassJoin(year?.id ?? null))
    .leftJoin(classGroups, eq(classGroups.id, enrolments.classGroupId))
    .where(and(eq(learners.schoolId, schoolId), eq(learners.id, learnerId), isNull(learners.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function getGuardian(schoolId: string, guardianId: string) {
  const [row] = await getDb()
    .select()
    .from(guardians)
    .where(and(eq(guardians.schoolId, schoolId), eq(guardians.id, guardianId), isNull(guardians.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function listContacts(schoolId: string, guardianIds: string[]) {
  if (guardianIds.length === 0) return [];
  return getDb()
    .select()
    .from(guardianContacts)
    .where(
      and(
        eq(guardianContacts.schoolId, schoolId),
        inArray(guardianContacts.guardianId, guardianIds),
        isNull(guardianContacts.deletedAt),
      ),
    )
    .orderBy(sql`${guardianContacts.isPrimary} desc`, asc(guardianContacts.createdAt));
}

// Guardians of one learner, with the link details.
export async function listLearnerGuardians(schoolId: string, learnerId: string) {
  return getDb()
    .select({ guardian: guardians, link: learnerGuardians })
    .from(learnerGuardians)
    .innerJoin(guardians, eq(guardians.id, learnerGuardians.guardianId))
    .where(
      and(
        eq(learnerGuardians.schoolId, schoolId),
        eq(learnerGuardians.learnerId, learnerId),
        isNull(guardians.deletedAt),
      ),
    )
    .orderBy(sql`${learnerGuardians.isPrimary} desc`, asc(guardians.lastName));
}

// Children of one guardian, with their current class.
export async function listGuardianLearners(schoolId: string, guardianId: string) {
  const year = await getCurrentYear(schoolId);
  return getDb()
    .select({
      learner: learners,
      link: learnerGuardians,
      className: classGroups.name,
    })
    .from(learnerGuardians)
    .innerJoin(learners, eq(learners.id, learnerGuardians.learnerId))
    .leftJoin(enrolments, currentClassJoin(year?.id ?? null))
    .leftJoin(classGroups, eq(classGroups.id, enrolments.classGroupId))
    .where(
      and(
        eq(learnerGuardians.schoolId, schoolId),
        eq(learnerGuardians.guardianId, guardianId),
        isNull(learners.deletedAt),
      ),
    )
    .orderBy(asc(learners.firstName));
}

// Correlated subqueries name the outer table explicitly: in a single-table
// select Drizzle renders ${table.id} as a bare "id", which would bind to the
// subquery's own id column instead.
export async function searchGuardians(schoolId: string, q: string, limit = 50) {
  const db = getDb();
  const where: SQL[] = [eq(guardians.schoolId, schoolId), isNull(guardians.deletedAt)];
  if (q) {
    const term = `%${q.replace(/[%_]/g, "")}%`;
    const digits = q.replace(/\D/g, "");
    where.push(
      or(
        ilike(guardians.firstName, term),
        ilike(guardians.lastName, term),
        sql`(${guardians.firstName} || ' ' || ${guardians.lastName}) ilike ${term}`,
        // Phone search ignores formatting: "082 123" finds +2782123....
        digits.length >= 4
          ? sql`exists (select 1 from ${guardianContacts} gc where gc.guardian_id = "guardians"."id" and gc.deleted_at is null and regexp_replace(gc.value, '\\D', '', 'g') like ${`%${digits.replace(/^0/, "")}%`})`
          : sql`false`,
        sql`exists (select 1 from ${guardianContacts} gc where gc.guardian_id = "guardians"."id" and gc.deleted_at is null and gc.kind = 'email' and gc.value ilike ${term})`,
      )!,
    );
  }
  return db
    .select({
      id: guardians.id,
      title: guardians.title,
      firstName: guardians.firstName,
      lastName: guardians.lastName,
      preferredChannel: guardians.preferredChannel,
      hasPortal: sql<boolean>`${guardians.userId} is not null`,
      childCount: sql<number>`(select count(*)::int from ${learnerGuardians} lg where lg.guardian_id = "guardians"."id")`,
    })
    .from(guardians)
    .where(and(...where))
    .orderBy(asc(guardians.lastName), asc(guardians.firstName))
    .limit(limit);
}
