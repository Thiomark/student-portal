import Link from "next/link";
import { EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { listGrades, listTeacherOptions, staffName } from "@/server/classes";
import { getCurrentYear } from "@/server/school-data";
import { createClassGroup } from "../actions";
import { ClassForm } from "../forms";

export const metadata = { title: "Add class" };

export default async function NewClassPage({ params }: PageProps<"/s/[school]/classes/new">) {
  const { school: slug } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "classes.manage")) return <NoAccess />;

  const [year, grades, teachers] = await Promise.all([
    getCurrentYear(ctx.school.id),
    listGrades(ctx.school.id),
    listTeacherOptions(ctx.school.id),
  ]);
  const base = `/s/${slug}/classes`;

  return (
    <>
      <PageHeader
        title="Add class"
        description={year ? `For ${year.name}` : undefined}
        back={{ href: base, label: "Classes" }}
      />
      {!year ? (
        <EmptyState title="No current academic year">
          <Link href={`${base}/years`} className="link">
            Set up the academic year
          </Link>{" "}
          first.
        </EmptyState>
      ) : grades.length === 0 ? (
        <EmptyState title="No grades yet">
          <Link href={`${base}/grades`} className="link">
            Add your grades
          </Link>{" "}
          first.
        </EmptyState>
      ) : (
        <ClassForm
          action={createClassGroup.bind(null, slug)}
          grades={grades}
          teachers={teachers.map((t) => ({ id: t.id, name: staffName(t) }))}
          submitLabel="Save class"
        />
      )}
    </>
  );
}
