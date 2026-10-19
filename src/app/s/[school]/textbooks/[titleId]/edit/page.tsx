import { notFound } from "next/navigation";
import { NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { isUuid } from "@/lib/ids";
import { listGrades, listSubjects } from "@/server/classes";
import { getTitle } from "@/server/textbooks";
import { updateTitle } from "../../actions";
import { TitleForm } from "../../forms";

export const metadata = { title: "Edit textbook" };

export default async function EditTitlePage({ params }: PageProps<"/s/[school]/textbooks/[titleId]/edit">) {
  const { school: slug, titleId } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "textbooks.manage")) return <NoAccess />;
  if (!isUuid(titleId)) notFound();

  const [row, grades, subjects] = await Promise.all([
    getTitle(ctx.school.id, titleId),
    listGrades(ctx.school.id),
    listSubjects(ctx.school.id),
  ]);
  if (!row) notFound();

  return (
    <>
      <PageHeader
        title={`Edit ${row.title.title}`}
        back={{ href: `/s/${slug}/textbooks/${titleId}`, label: "Back to textbook" }}
      />
      <TitleForm
        action={updateTitle.bind(null, slug, titleId)}
        title={row.title}
        grades={grades}
        subjects={subjects}
        submitLabel="Save changes"
      />
    </>
  );
}
