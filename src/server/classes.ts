import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

const { academicYears, grades, classGroups, enrolments, learners, staff, subjects, textbookTitles } = schema;

// Correlated subqueries name the outer table explicitly: in a single-table
// select Drizzle renders columns unqualified, which would bind to the inner table.
export async function listAcademicYears(schoolId: string) {
  return getDb()
    .select({
      id: academicYears.id,
      name: academicYears.name,
      startsOn: academicYears.startsOn,
      endsOn: academicYears.endsOn,
      isCurrent: academicYears.isCurrent,
      classCount: sql<number>`(select count(*)::int from ${classGroups} cg where cg.academic_year_id = ${academicYears}.id and cg.deleted_at is null)`,
    })
    .from(academicYears)
    .where(eq(academicYears.schoolId, schoolId))
    .orderBy(desc(academicYears.startsOn));
}

export async function getAcademicYear(schoolId: string, yearId: string) {
  const [row] = await getDb()
    .select()
    .from(academicYears)
    .where(and(eq(academicYears.schoolId, schoolId), eq(academicYears.id, yearId)))
    .limit(1);
  return row ?? null;
}

// Grades in display order, with how many live classes (any year) and titles
// use each one.
export async function listGrades(schoolId: string) {
  return getDb()
    .select({
      id: grades.id,
      name: grades.name,
      sortOrder: grades.sortOrder,
      classCount: sql<number>`(select count(*)::int from ${classGroups} cg where cg.grade_id = ${grades}.id and cg.deleted_at is null)`,
    })
    .from(grades)
    .where(and(eq(grades.schoolId, schoolId), isNull(grades.deletedAt)))
    .orderBy(asc(grades.sortOrder), asc(grades.name));
}

export async function getGrade(schoolId: string, gradeId: string) {
  const [row] = await getDb()
    .select()
    .from(grades)
    .where(and(eq(grades.schoolId, schoolId), eq(grades.id, gradeId), isNull(grades.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function listSubjects(schoolId: string) {
  return getDb()
    .select({
      id: subjects.id,
      name: subjects.name,
      code: subjects.code,
      titleCount: sql<number>`(select count(*)::int from ${textbookTitles} tt where tt.subject_id = ${subjects}.id and tt.deleted_at is null)`,
    })
    .from(subjects)
    .where(and(eq(subjects.schoolId, schoolId), isNull(subjects.deletedAt)))
    .orderBy(asc(subjects.name));
}

export async function getSubject(schoolId: string, subjectId: string) {
  const [row] = await getDb()
    .select()
    .from(subjects)
    .where(and(eq(subjects.schoolId, schoolId), eq(subjects.id, subjectId), isNull(subjects.deletedAt)))
    .limit(1);
  return row ?? null;
}

// Staff who can be given a class.
export async function listTeacherOptions(schoolId: string) {
  return getDb()
    .select({ id: staff.id, title: staff.title, firstName: staff.firstName, lastName: staff.lastName })
    .from(staff)
    .where(and(eq(staff.schoolId, schoolId), isNull(staff.deletedAt), sql`${staff.status} <> 'left'`))
    .orderBy(asc(staff.lastName), asc(staff.firstName));
}

export function staffName(s: { title: string | null; firstName: string; lastName: string }): string {
  return [s.title, s.firstName, s.lastName].filter(Boolean).join(" ");
}

// Classes of one academic year with grade, teacher and open-enrolment count.
export async function listClassesForYear(schoolId: string, yearId: string) {
  return getDb()
    .select({
      id: classGroups.id,
      name: classGroups.name,
      room: classGroups.room,
      gradeName: grades.name,
      teacherTitle: staff.title,
      teacherFirstName: staff.firstName,
      teacherLastName: staff.lastName,
      learnerCount: sql<number>`(select count(*)::int from ${enrolments} e where e.class_group_id = ${classGroups.id} and e.ended_on is null)`,
    })
    .from(classGroups)
    .innerJoin(grades, eq(grades.id, classGroups.gradeId))
    .leftJoin(staff, eq(staff.id, classGroups.teacherId))
    .where(
      and(eq(classGroups.schoolId, schoolId), eq(classGroups.academicYearId, yearId), isNull(classGroups.deletedAt)),
    )
    .orderBy(asc(grades.sortOrder), asc(classGroups.name));
}

export async function getClassGroup(schoolId: string, classGroupId: string) {
  const [row] = await getDb()
    .select({
      classGroup: classGroups,
      gradeName: grades.name,
      yearName: academicYears.name,
      yearIsCurrent: academicYears.isCurrent,
      teacher: { id: staff.id, title: staff.title, firstName: staff.firstName, lastName: staff.lastName },
    })
    .from(classGroups)
    .innerJoin(grades, eq(grades.id, classGroups.gradeId))
    .innerJoin(academicYears, eq(academicYears.id, classGroups.academicYearId))
    .leftJoin(staff, eq(staff.id, classGroups.teacherId))
    .where(
      and(eq(classGroups.schoolId, schoolId), eq(classGroups.id, classGroupId), isNull(classGroups.deletedAt)),
    )
    .limit(1);
  return row ?? null;
}

// Learners with an open enrolment in the class.
export async function listClassLearners(schoolId: string, classGroupId: string) {
  return getDb()
    .select({
      id: learners.id,
      firstName: learners.firstName,
      lastName: learners.lastName,
      preferredName: learners.preferredName,
      admissionNumber: learners.admissionNumber,
      status: learners.status,
      startedOn: enrolments.startedOn,
    })
    .from(enrolments)
    .innerJoin(learners, eq(learners.id, enrolments.learnerId))
    .where(
      and(
        eq(enrolments.schoolId, schoolId),
        eq(enrolments.classGroupId, classGroupId),
        isNull(enrolments.endedOn),
        isNull(learners.deletedAt),
      ),
    )
    .orderBy(asc(learners.lastName), asc(learners.firstName));
}
