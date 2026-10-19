import { NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { fullName } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { getLearner } from "@/server/school-data";
import { createGuardian } from "../actions";
import { NewGuardianForm } from "../forms";

export const metadata = { title: "Add parent" };

export default async function NewGuardianPage({ params, searchParams }: PageProps<"/s/[school]/guardians/new">) {
  const { school: slug } = await params;
  const { learner: learnerParam } = await searchParams;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "guardians.manage")) return <NoAccess />;
  const learner = isUuid(learnerParam) ? await getLearner(ctx.school.id, learnerParam) : null;

  return (
    <>
      <PageHeader
        title={learner ? `Add a parent for ${fullName(learner.learner)}` : "Add parent"}
        description="Record every number and what it can be used for. A parent with no phone or email gets printed letters."
        back={
          learner
            ? { href: `/s/${slug}/learners/${learner.learner.id}`, label: "Back to learner" }
            : { href: `/s/${slug}/guardians`, label: "Parents" }
        }
      />
      <NewGuardianForm action={createGuardian.bind(null, slug)} learnerId={learner?.learner.id} />
    </>
  );
}
