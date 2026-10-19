import { NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { listGrades, listSubjects } from "@/server/classes";
import { createTitle } from "../actions";
import { TitleForm } from "../forms";

export const metadata = { title: "Add textbook" };

export default async function NewTitlePage({ params }: PageProps<"/s/[school]/textbooks/new">) {
  const { school: slug } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "textbooks.manage")) return <NoAccess />;
  const [grades, subjects] = await Promise.all([listGrades(ctx.school.id), listSubjects(ctx.school.id)]);

  return (
    <>
      <PageHeader
        title="Add textbook"
        description="Add the title first, then its numbered copies."
        back={{ href: `/s/${slug}/textbooks`, label: "Textbooks" }}
      />
      <TitleForm
        action={createTitle.bind(null, slug)}
        grades={grades}
        subjects={subjects}
        submitLabel="Save title"
      />
    </>
  );
}
