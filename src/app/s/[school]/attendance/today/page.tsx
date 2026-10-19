import { and, asc, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { Badge, EmptyState, NoAccess, PageHeader, Section } from "@/components/ui";
import { getDb, schema } from "@/db/client";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDate, fullName, schoolToday, shiftDate } from "@/lib/format";
import { getCurrentYear } from "@/server/school-data";

export const metadata = { title: "Attendance today" };

const { classGroups, grades, attendanceRegisters, attendanceRecords, learners, staff } = schema;
const STATUS_TONE = { absent: "red", late: "amber", excused: "gray", present: "green" } as const;

// The office view: which classes have taken the register, and who is away.
export default async function AttendanceTodayPage({ params, searchParams }: PageProps<"/s/[school]/attendance/today">) {
  const { school: slug } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "attendance.view")) return <NoAccess />;

  const tz = ctx.school.timezone;
  const today = schoolToday(tz);
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const schoolId = ctx.school.id;
  const db = getDb();
  const year = await getCurrentYear(schoolId);

  const [classes, away] = await Promise.all([
    db
      .select({
        id: classGroups.id,
        name: classGroups.name,
        gradeName: grades.name,
        teacherFirstName: staff.firstName,
        teacherLastName: staff.lastName,
        takenAt: attendanceRegisters.takenAt,
        present: sql<number>`(select count(*)::int from ${attendanceRecords} r where r.register_id = ${attendanceRegisters.id} and r.status = 'present')`,
        absent: sql<number>`(select count(*)::int from ${attendanceRecords} r where r.register_id = ${attendanceRegisters.id} and r.status = 'absent')`,
        late: sql<number>`(select count(*)::int from ${attendanceRecords} r where r.register_id = ${attendanceRegisters.id} and r.status = 'late')`,
      })
      .from(classGroups)
      .innerJoin(grades, eq(grades.id, classGroups.gradeId))
      .leftJoin(staff, eq(staff.id, classGroups.teacherId))
      .leftJoin(
        attendanceRegisters,
        and(eq(attendanceRegisters.classGroupId, classGroups.id), eq(attendanceRegisters.date, date)),
      )
      .where(
        and(
          eq(classGroups.schoolId, schoolId),
          year ? eq(classGroups.academicYearId, year.id) : sql`false`,
          isNull(classGroups.deletedAt),
        ),
      )
      .orderBy(asc(grades.sortOrder), asc(classGroups.name)),
    db
      .select({
        learnerId: learners.id,
        firstName: learners.firstName,
        lastName: learners.lastName,
        preferredName: learners.preferredName,
        status: attendanceRecords.status,
        reason: attendanceRecords.reason,
        notifiedAt: attendanceRecords.guardiansNotifiedAt,
        className: classGroups.name,
      })
      .from(attendanceRecords)
      .innerJoin(learners, eq(learners.id, attendanceRecords.learnerId))
      .innerJoin(attendanceRegisters, eq(attendanceRegisters.id, attendanceRecords.registerId))
      .innerJoin(classGroups, eq(classGroups.id, attendanceRegisters.classGroupId))
      .where(
        and(
          eq(attendanceRecords.schoolId, schoolId),
          eq(attendanceRecords.date, date),
          sql`${attendanceRecords.status} <> 'present'`,
        ),
      )
      .orderBy(asc(classGroups.name), asc(learners.lastName)),
  ]);

  const notTaken = classes.filter((c) => !c.takenAt);
  const totals = classes.reduce(
    (t, c) => ({ present: t.present + c.present, absent: t.absent + c.absent, late: t.late + c.late }),
    { present: 0, absent: 0, late: 0 },
  );
  const base = `/s/${slug}/attendance/today`;

  return (
    <>
      <PageHeader
        title={date === today ? "Attendance today" : `Attendance on ${formatDate(`${date}T12:00:00Z`, tz)}`}
        back={{ href: `/s/${slug}/attendance`, label: "Register" }}
        actions={
          <div className="flex items-center gap-2">
            <Link href={`${base}?date=${shiftDate(date, -1)}`} className="btn-secondary">
              ← Previous day
            </Link>
            {date < today ? (
              <Link href={`${base}?date=${shiftDate(date, 1)}`} className="btn-secondary">
                Next day →
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Registers taken" value={`${classes.length - notTaken.length} / ${classes.length}`} warn={notTaken.length > 0} />
        <Stat label="Present" value={totals.present} />
        <Stat label="Absent" value={totals.absent} warn={totals.absent > 0} />
        <Stat label="Late" value={totals.late} />
      </div>

      {notTaken.length > 0 ? (
        <Section title={`Registers not taken (${notTaken.length})`}>
          <ul className="flex flex-wrap gap-2 text-sm">
            {notTaken.map((c) => (
              <li key={c.id} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1">
                <span className="font-medium">{c.name}</span>{" "}
                <span className="text-slate-600">
                  {c.teacherFirstName ? `${c.teacherFirstName} ${c.teacherLastName}` : "no class teacher"}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title={`Not present (${away.length})`}>
        {away.length === 0 ? (
          <EmptyState title={classes.length - notTaken.length ? "Everyone is here" : "No registers taken yet"} />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Learner</th>
                <th>Class</th>
                <th>Status</th>
                <th>Reason</th>
                <th>Parents told</th>
              </tr>
            </thead>
            <tbody>
              {away.map((a) => (
                <tr key={a.learnerId}>
                  <td>
                    <Link href={`/s/${slug}/learners/${a.learnerId}`} className="link">
                      {fullName(a)}
                    </Link>
                  </td>
                  <td>{a.className}</td>
                  <td>
                    <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                  </td>
                  <td>{a.reason ?? "—"}</td>
                  <td>{a.notifiedAt ? "Yes" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="By class">
        <table className="table">
          <thead>
            <tr>
              <th>Class</th>
              <th>Taken</th>
              <th>Present</th>
              <th>Absent</th>
              <th>Late</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{c.name}</td>
                <td>
                  {c.takenAt ? (
                    new Intl.DateTimeFormat("en-ZA", { timeStyle: "short", timeZone: tz }).format(c.takenAt)
                  ) : (
                    <Badge tone="amber">Not yet</Badge>
                  )}
                </td>
                <td>{c.takenAt ? c.present : "—"}</td>
                <td>{c.takenAt ? c.absent : "—"}</td>
                <td>{c.takenAt ? c.late : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className="card p-4">
      <p className={`text-2xl font-semibold ${warn ? "text-amber-700" : ""}`}>{value}</p>
      <p className="text-sm text-slate-600">{label}</p>
    </div>
  );
}
