import { notFound } from "next/navigation";
import { NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { isUuid } from "@/lib/ids";
import { getClassGroup, listGrades, listTeacherOptions, staffName } from "@/server/classes";
import { updateClassGroup } from "../../actions";
import { ClassForm } from "../../forms";

export const metadata = { title: "Edit class" };

export default async function EditClassPage({ params }: PageProps<"/s/[school]/classes/[classId]/edit">) {
  const { school: slug, classId } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "classes.manage")) return <NoAccess />;
  if (!isUuid(classId)) notFound();

  const [row, grades, teachers] = await Promise.all([
    getClassGroup(ctx.school.id, classId),
    listGrades(ctx.school.id),
    listTeacherOptions(ctx.school.id),
  ]);
  if (!row) notFound();

  const teacherOptions = teachers.map((t) => ({ id: t.id, name: staffName(t) }));
  // Keep a teacher who has since left selectable so saving doesn't drop them.
  if (row.teacher && !teacherOptions.some((t) => t.id === row.teacher?.id)) {
    teacherOptions.unshift({ id: row.teacher.id, name: `${staffName(row.teacher)} (left)` });
  }

  return (
    <>
      <PageHeader
        title={`Edit class ${row.classGroup.name}`}
        description={row.yearName}
        back={{ href: `/s/${slug}/classes/${classId}`, label: "Back to class" }}
      />
      <ClassForm
        action={updateClassGroup.bind(null, slug, classId)}
        grades={grades}
        teachers={teacherOptions}
        classGroup={row.classGroup}
        submitLabel="Save changes"
      />
    </>
  );
}
