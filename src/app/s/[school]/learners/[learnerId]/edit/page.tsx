import { notFound } from "next/navigation";
import { NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { fullName } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { getLearner, listCurrentClasses } from "@/server/school-data";
import { updateLearner } from "../../actions";
import { LearnerForm } from "../../learner-form";

export const metadata = { title: "Edit learner" };

export default async function EditLearnerPage({ params }: PageProps<"/s/[school]/learners/[learnerId]/edit">) {
  const { school: slug, learnerId } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "learners.manage")) return <NoAccess />;
  if (!isUuid(learnerId)) notFound();
  const [row, classes] = await Promise.all([getLearner(ctx.school.id, learnerId), listCurrentClasses(ctx.school.id)]);
  if (!row) notFound();

  return (
    <>
      <PageHeader
        title={`Edit ${fullName(row.learner)}`}
        back={{ href: `/s/${slug}/learners/${learnerId}`, label: "Back to learner" }}
      />
      <LearnerForm
        action={updateLearner.bind(null, slug, learnerId)}
        learner={row.learner}
        classes={classes}
        classGroupId={row.classGroupId}
        submitLabel="Save changes"
      />
    </>
  );
}
