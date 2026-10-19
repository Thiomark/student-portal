import { NoAccess, PageHeader, Section } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { listSubjects } from "@/server/classes";
import { createSubject, updateSubject } from "../actions";
import { SubjectCreateForm, SubjectRow } from "../forms";
import { ClassesNav } from "../section-nav";

export const metadata = { title: "Subjects" };

export default async function SubjectsPage({ params }: PageProps<"/s/[school]/classes/subjects">) {
  const { school: slug } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "classes.manage")) return <NoAccess />;

  const subjects = await listSubjects(ctx.school.id);

  return (
    <>
      <PageHeader title="Subjects" description="Textbook titles are filed under these subjects." />
      <ClassesNav slug={slug} current="/subjects" />

      <Section title="Subjects">
        {subjects.length === 0 ? (
          <p className="text-sm text-slate-600">No subjects yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {subjects.map((s) => (
              <SubjectRow
                key={`${s.id}-${s.name}-${s.code}`}
                subject={s}
                update={updateSubject.bind(null, slug, s.id)}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title="Add a subject">
        <SubjectCreateForm action={createSubject.bind(null, slug)} />
      </Section>
    </>
  );
}
