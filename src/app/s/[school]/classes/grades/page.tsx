import { NoAccess, PageHeader, Section } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { listGrades } from "@/server/classes";
import { createGrade, deleteGrade, updateGrade } from "../actions";
import { GradeCreateForm, GradeRow } from "../forms";
import { ClassesNav } from "../section-nav";

export const metadata = { title: "Grades" };

export default async function GradesPage({ params }: PageProps<"/s/[school]/classes/grades">) {
  const { school: slug } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "classes.manage")) return <NoAccess />;

  const grades = await listGrades(ctx.school.id);
  const nextSortOrder = grades.length ? Math.max(...grades.map((g) => g.sortOrder)) + 1 : 1;

  return (
    <>
      <PageHeader title="Grades" description="Lists show grades by their order number, lowest first." />
      <ClassesNav slug={slug} current="/grades" />

      <Section title="Grades">
        {grades.length === 0 ? (
          <p className="text-sm text-slate-600">No grades yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {grades.map((g) => (
              <GradeRow
                key={`${g.id}-${g.name}-${g.sortOrder}`}
                grade={g}
                update={updateGrade.bind(null, slug, g.id)}
                // Grades that classes still use can't be removed.
                remove={g.classCount === 0 ? deleteGrade.bind(null, slug, g.id) : null}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title="Add a grade">
        <GradeCreateForm action={createGrade.bind(null, slug)} nextSortOrder={nextSortOrder} />
      </Section>
    </>
  );
}
