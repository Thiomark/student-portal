import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { CopyStatus } from "@/lib/validation/textbooks";
import { getCurrentYear, PAGE_SIZE } from "@/server/school-data";

const { textbookTitles, textbookCopies, textbookLoans, grades, subjects, learners, enrolments, classGroups } = schema;

export { PAGE_SIZE };

// Today's date (YYYY-MM-DD) in the school's timezone, for due dates.
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

function likeTerm(q: string) {
  return `%${q.replace(/[%_\\]/g, "")}%`;
}

// A copy counts as issued while it has an open loan, whatever its status
// column says, so counts stay right even if the desk lags behind.
const openLoanJoin = and(eq(textbookLoans.copyId, textbookCopies.id), isNull(textbookLoans.returnedAt));

const copyCounts = {
  total: sql<number>`count(${textbookCopies.id})::int`,
  available: sql<number>`(count(${textbookCopies.id}) filter (where ${textbookLoans.id} is null and ${textbookCopies.status} = 'available'))::int`,
  issued: sql<number>`(count(${textbookCopies.id}) filter (where ${textbookLoans.id} is not null))::int`,
  lost: sql<number>`(count(${textbookCopies.id}) filter (where ${textbookLoans.id} is null and ${textbookCopies.status} = 'lost'))::int`,
  writtenOff: sql<number>`(count(${textbookCopies.id}) filter (where ${textbookLoans.id} is null and ${textbookCopies.status} = 'written_off'))::int`,
};

export async function listTitles(
  schoolId: string,
  opts: { q?: string; gradeId?: string; subjectId?: string; page?: number },
) {
  const where: SQL[] = [eq(textbookTitles.schoolId, schoolId), isNull(textbookTitles.deletedAt)];
  if (opts.q) {
    const term = likeTerm(opts.q);
    where.push(or(ilike(textbookTitles.title, term), ilike(textbookTitles.isbn, term), ilike(textbookTitles.publisher, term))!);
  }
  if (opts.gradeId) where.push(eq(textbookTitles.gradeId, opts.gradeId));
  if (opts.subjectId) where.push(eq(textbookTitles.subjectId, opts.subjectId));

  const page = Math.max(1, opts.page ?? 1);
  const rows = await getDb()
    .select({
      id: textbookTitles.id,
      title: textbookTitles.title,
      isbn: textbookTitles.isbn,
      edition: textbookTitles.edition,
      gradeName: grades.name,
      subjectName: subjects.name,
      ...copyCounts,
    })
    .from(textbookTitles)
    .leftJoin(grades, eq(grades.id, textbookTitles.gradeId))
    .leftJoin(subjects, eq(subjects.id, textbookTitles.subjectId))
    .leftJoin(
      textbookCopies,
      and(
        eq(textbookCopies.titleId, textbookTitles.id),
        eq(textbookCopies.schoolId, schoolId),
        isNull(textbookCopies.deletedAt),
      ),
    )
    .leftJoin(textbookLoans, openLoanJoin)
    .where(and(...where))
    .groupBy(textbookTitles.id, grades.name, grades.sortOrder, subjects.name)
    .orderBy(sql`${grades.sortOrder} asc nulls last`, asc(subjects.name), asc(textbookTitles.title))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, page };
}

export async function getTitle(schoolId: string, titleId: string) {
  const [row] = await getDb()
    .select({ title: textbookTitles, gradeName: grades.name, subjectName: subjects.name, subjectCode: subjects.code })
    .from(textbookTitles)
    .leftJoin(grades, eq(grades.id, textbookTitles.gradeId))
    .leftJoin(subjects, eq(subjects.id, textbookTitles.subjectId))
    .where(
      and(eq(textbookTitles.schoolId, schoolId), eq(textbookTitles.id, titleId), isNull(textbookTitles.deletedAt)),
    )
    .limit(1);
  return row ?? null;
}

export async function getTitleCounts(schoolId: string, titleId: string) {
  const [row] = await getDb()
    .select(copyCounts)
    .from(textbookCopies)
    .leftJoin(textbookLoans, openLoanJoin)
    .where(
      and(
        eq(textbookCopies.schoolId, schoolId),
        eq(textbookCopies.titleId, titleId),
        isNull(textbookCopies.deletedAt),
      ),
    );
  return row ?? { total: 0, available: 0, issued: 0, lost: 0, writtenOff: 0 };
}

export type CopyFilter = CopyStatus | "";

export async function listCopies(
  schoolId: string,
  titleId: string,
  opts: { status?: CopyFilter; q?: string; page?: number },
) {
  const where: SQL[] = [
    eq(textbookCopies.schoolId, schoolId),
    eq(textbookCopies.titleId, titleId),
    isNull(textbookCopies.deletedAt),
  ];
  if (opts.q) where.push(ilike(textbookCopies.copyNumber, likeTerm(opts.q)));
  if (opts.status === "issued") where.push(isNotNull(textbookLoans.id));
  else if (opts.status) where.push(and(isNull(textbookLoans.id), eq(textbookCopies.status, opts.status))!);

  const page = Math.max(1, opts.page ?? 1);
  const rows = await getDb()
    .select({
      id: textbookCopies.id,
      copyNumber: textbookCopies.copyNumber,
      condition: textbookCopies.condition,
      status: textbookCopies.status,
      notes: textbookCopies.notes,
      loanId: textbookLoans.id,
      issuedAt: textbookLoans.issuedAt,
      dueOn: textbookLoans.dueOn,
      learnerId: learners.id,
      learnerFirstName: learners.firstName,
      learnerLastName: learners.lastName,
      learnerPreferredName: learners.preferredName,
    })
    .from(textbookCopies)
    .leftJoin(textbookLoans, openLoanJoin)
    .leftJoin(learners, eq(learners.id, textbookLoans.learnerId))
    .where(and(...where))
    // Natural-ish order: shorter numbers first so MATH8-9 sorts before MATH8-10.
    .orderBy(sql`length(${textbookCopies.copyNumber})`, asc(textbookCopies.copyNumber))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, page };
}

export async function getCopy(schoolId: string, copyId: string) {
  const [row] = await getDb()
    .select({
      copy: textbookCopies,
      titleName: textbookTitles.title,
      openLoanId: textbookLoans.id,
      issuedAt: textbookLoans.issuedAt,
      dueOn: textbookLoans.dueOn,
      learner: {
        id: learners.id,
        firstName: learners.firstName,
        lastName: learners.lastName,
        preferredName: learners.preferredName,
      },
    })
    .from(textbookCopies)
    .innerJoin(textbookTitles, eq(textbookTitles.id, textbookCopies.titleId))
    .leftJoin(textbookLoans, openLoanJoin)
    .leftJoin(learners, eq(learners.id, textbookLoans.learnerId))
    .where(
      and(eq(textbookCopies.schoolId, schoolId), eq(textbookCopies.id, copyId), isNull(textbookCopies.deletedAt)),
    )
    .limit(1);
  return row ?? null;
}

export async function listCopyLoans(schoolId: string, copyId: string, limit = 20) {
  return getDb()
    .select({
      id: textbookLoans.id,
      issuedAt: textbookLoans.issuedAt,
      dueOn: textbookLoans.dueOn,
      returnedAt: textbookLoans.returnedAt,
      conditionOut: textbookLoans.conditionOut,
      conditionIn: textbookLoans.conditionIn,
      outcome: textbookLoans.outcome,
      learnerId: learners.id,
      firstName: learners.firstName,
      lastName: learners.lastName,
      preferredName: learners.preferredName,
    })
    .from(textbookLoans)
    .innerJoin(learners, eq(learners.id, textbookLoans.learnerId))
    .where(and(eq(textbookLoans.schoolId, schoolId), eq(textbookLoans.copyId, copyId)))
    .orderBy(desc(textbookLoans.issuedAt))
    .limit(limit);
}

// Title options for filters.
export async function listTitleOptions(schoolId: string) {
  return getDb()
    .select({ id: textbookTitles.id, title: textbookTitles.title, gradeName: grades.name })
    .from(textbookTitles)
    .leftJoin(grades, eq(grades.id, textbookTitles.gradeId))
    .where(and(eq(textbookTitles.schoolId, schoolId), isNull(textbookTitles.deletedAt)))
    .orderBy(sql`${grades.sortOrder} asc nulls last`, asc(textbookTitles.title));
}

export type LoanView = "open" | "overdue" | "returned";

// Loans for the overview. Class filtering uses the learner's open enrolment
// in the current year, so a learner who moved class shows under the new one.
export async function listLoans(
  schoolId: string,
  opts: {
    view: LoanView;
    today: string;
    classGroupId?: string;
    titleId?: string;
    changedOnly?: boolean;
    page?: number;
  },
) {
  const year = await getCurrentYear(schoolId);
  const where: SQL[] = [eq(textbookLoans.schoolId, schoolId)];
  if (opts.view === "returned") {
    where.push(isNotNull(textbookLoans.returnedAt));
    if (opts.changedOnly) {
      where.push(
        or(
          ne(textbookLoans.conditionIn, textbookLoans.conditionOut),
          and(isNotNull(textbookLoans.outcome), ne(textbookLoans.outcome, "returned")),
        )!,
      );
    }
  } else {
    where.push(isNull(textbookLoans.returnedAt));
    if (opts.view === "overdue") where.push(lt(textbookLoans.dueOn, opts.today));
  }
  if (opts.titleId) where.push(eq(textbookCopies.titleId, opts.titleId));
  if (opts.classGroupId) where.push(eq(enrolments.classGroupId, opts.classGroupId));

  const page = Math.max(1, opts.page ?? 1);
  const rows = await getDb()
    .select({
      id: textbookLoans.id,
      issuedAt: textbookLoans.issuedAt,
      dueOn: textbookLoans.dueOn,
      returnedAt: textbookLoans.returnedAt,
      conditionOut: textbookLoans.conditionOut,
      conditionIn: textbookLoans.conditionIn,
      outcome: textbookLoans.outcome,
      notes: textbookLoans.notes,
      copyId: textbookCopies.id,
      copyNumber: textbookCopies.copyNumber,
      titleId: textbookTitles.id,
      title: textbookTitles.title,
      learnerId: learners.id,
      firstName: learners.firstName,
      lastName: learners.lastName,
      preferredName: learners.preferredName,
      className: classGroups.name,
    })
    .from(textbookLoans)
    .innerJoin(textbookCopies, eq(textbookCopies.id, textbookLoans.copyId))
    .innerJoin(textbookTitles, eq(textbookTitles.id, textbookCopies.titleId))
    .innerJoin(learners, eq(learners.id, textbookLoans.learnerId))
    .leftJoin(
      enrolments,
      and(
        eq(enrolments.learnerId, learners.id),
        isNull(enrolments.endedOn),
        year ? eq(enrolments.academicYearId, year.id) : sql`false`,
      ),
    )
    .leftJoin(classGroups, eq(classGroups.id, enrolments.classGroupId))
    .where(and(...where))
    .orderBy(
      ...(opts.view === "returned"
        ? [desc(textbookLoans.returnedAt)]
        : opts.view === "overdue"
          ? [asc(textbookLoans.dueOn), asc(learners.lastName)]
          : [asc(classGroups.name), asc(learners.lastName), asc(learners.firstName), asc(textbookTitles.title)]),
    )
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, page };
}

// Copies that are lost, written off or damaged, with whoever had them last.
export async function listLostDamaged(schoolId: string, opts: { titleId?: string; page?: number }) {
  const where: SQL[] = [
    eq(textbookCopies.schoolId, schoolId),
    isNull(textbookCopies.deletedAt),
    or(inArray(textbookCopies.status, ["lost", "written_off"]), eq(textbookCopies.condition, "damaged"))!,
  ];
  if (opts.titleId) where.push(eq(textbookCopies.titleId, opts.titleId));

  const page = Math.max(1, opts.page ?? 1);
  const db = getDb();
  const rows = await db
    .select({
      id: textbookCopies.id,
      copyNumber: textbookCopies.copyNumber,
      condition: textbookCopies.condition,
      status: textbookCopies.status,
      notes: textbookCopies.notes,
      updatedAt: textbookCopies.updatedAt,
      titleId: textbookTitles.id,
      title: textbookTitles.title,
    })
    .from(textbookCopies)
    .innerJoin(textbookTitles, eq(textbookTitles.id, textbookCopies.titleId))
    .where(and(...where))
    .orderBy(desc(textbookCopies.updatedAt))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  const pageRows = rows.slice(0, PAGE_SIZE);

  const lastLoans = pageRows.length
    ? await db
        .selectDistinctOn([textbookLoans.copyId], {
          copyId: textbookLoans.copyId,
          returnedAt: textbookLoans.returnedAt,
          learnerId: learners.id,
          firstName: learners.firstName,
          lastName: learners.lastName,
          preferredName: learners.preferredName,
        })
        .from(textbookLoans)
        .innerJoin(learners, eq(learners.id, textbookLoans.learnerId))
        .where(
          and(
            eq(textbookLoans.schoolId, schoolId),
            inArray(
              textbookLoans.copyId,
              pageRows.map((r) => r.id),
            ),
          ),
        )
        .orderBy(textbookLoans.copyId, desc(textbookLoans.issuedAt))
    : [];
  const byCopy = new Map(lastLoans.map((l) => [l.copyId, l]));

  return {
    rows: pageRows.map((r) => ({ ...r, lastLoan: byCopy.get(r.id) ?? null })),
    hasMore: rows.length > PAGE_SIZE,
    page,
  };
}
