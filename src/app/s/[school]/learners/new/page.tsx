import { NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { listCurrentClasses } from "@/server/school-data";
import { createLearner } from "../actions";
import { LearnerForm } from "../learner-form";

export const metadata = { title: "Add learner" };

export default async function NewLearnerPage({ params }: PageProps<"/s/[school]/learners/new">) {
  const { school: slug } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "learners.manage")) return <NoAccess />;
  const classes = await listCurrentClasses(ctx.school.id);

  return (
    <>
      <PageHeader title="Add learner" back={{ href: `/s/${slug}/learners`, label: "Learners" }} />
      <LearnerForm action={createLearner.bind(null, slug)} classes={classes} submitLabel="Save learner" />
    </>
  );
}
