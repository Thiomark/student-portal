import Link from "next/link";
import { EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { isUuid } from "@/lib/ids";
import { listAcademicYears, listClassesForYear, staffName } from "@/server/classes";
import { ClassesNav } from "./section-nav";

export const metadata = { title: "Classes" };

export default async function ClassesPage({ params, searchParams }: PageProps<"/s/[school]/classes">) {
  const { school: slug } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "classes.manage")) return <NoAccess />;

  const years = await listAcademicYears(ctx.school.id);
  const current = years.find((y) => y.isCurrent) ?? null;
  const requested = typeof sp.year === "string" && isUuid(sp.year) ? years.find((y) => y.id === sp.year) : null;
  const year = requested ?? current;
  const classes = year ? await listClassesForYear(ctx.school.id, year.id) : [];
  const base = `/s/${slug}/classes`;
  const totalLearners = classes.reduce((sum, c) => sum + c.learnerCount, 0);

  return (
    <>
      <PageHeader
        title="Classes"
        description={
          year
            ? `${year.name}${year.isCurrent ? " (current year)" : ""} · ${classes.length} classes · ${totalLearners} learners`
            : undefined
        }
        actions={
          current && year?.id === current.id ? (
            <Link href={`${base}/new`} className="btn-primary">
              Add class
            </Link>
          ) : null
        }
      />
      <ClassesNav slug={slug} current="" />

      {!current ? (
        <EmptyState title="No current academic year">
          <Link href={`${base}/years`} className="link">
            Set up the academic year
          </Link>{" "}
          before adding classes.
        </EmptyState>
      ) : (
        <>
          {years.length > 1 ? (
            <form className="mb-4 flex flex-wrap gap-2">
              <select name="year" defaultValue={year?.id} className="input w-auto" aria-label="Academic year">
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                    {y.isCurrent ? " (current)" : ""}
                  </option>
                ))}
              </select>
              <button className="btn-secondary">Show</button>
            </form>
          ) : null}

          {classes.length === 0 ? (
            <EmptyState title={`No classes in ${year?.name}`}>
              {year?.isCurrent ? (
                <Link href={`${base}/new`} className="link">
                  Add the first class
                </Link>
              ) : null}
            </EmptyState>
          ) : (
            <div className="card overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Grade</th>
                    <th>Class teacher</th>
                    <th>Room</th>
                    <th className="text-right">Learners</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`${base}/${c.id}`} className="link font-medium">
                          {c.name}
                        </Link>
                      </td>
                      <td>{c.gradeName}</td>
                      <td>
                        {c.teacherFirstName && c.teacherLastName
                          ? staffName({
                              title: c.teacherTitle,
                              firstName: c.teacherFirstName,
                              lastName: c.teacherLastName,
                            })
                          : "—"}
                      </td>
                      <td>{c.room ?? "—"}</td>
                      <td className="text-right">{c.learnerCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">
            Moving everyone up into next year&apos;s classes isn&apos;t automated yet: add the new year&apos;s classes,
            then change each learner&apos;s class from their page.
          </p>
        </>
      )}
    </>
  );
}
