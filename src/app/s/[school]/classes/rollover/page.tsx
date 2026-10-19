import { NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { nextYearName, shiftYear, suggestPlans } from "@/lib/rollover";
import { listClassesForYear, listClassLearners, listGrades } from "@/server/classes";
import { getCurrentYear } from "@/server/school-data";
import { ClassesNav } from "../section-nav";
import { runRollover } from "./actions";
import { RolloverForm } from "./form";

export const metadata = { title: "Year-end rollover" };

export default async function RolloverPage({ params }: PageProps<"/s/[school]/classes/rollover">) {
  const { school: slug } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "classes.manage")) return <NoAccess />;
  const schoolId = ctx.school.id;
  const year = await getCurrentYear(schoolId);

  if (!year) {
    return (
      <>
        <PageHeader title="Year-end rollover" />
        <ClassesNav slug={slug} current="/rollover" />
        <p className="text-sm text-slate-600">Set a current academic year first.</p>
      </>
    );
  }

  const [classes, grades] = await Promise.all([listClassesForYear(schoolId, year.id), listGrades(schoolId)]);
  const learners = await Promise.all(classes.map((c) => listClassLearners(schoolId, c.id)));
  const plans = suggestPlans(
    classes.map((c) => ({ id: c.id, name: c.name, gradeId: c.gradeId })),
    grades.map((g) => ({ id: g.id, name: g.name, sortOrder: g.sortOrder })),
  );

  return (
    <>
      <PageHeader
        title="Year-end rollover"
        description={`Move every class from ${year.name} into next year in one step. Check the plan below first.`}
      />
      <ClassesNav slug={slug} current="/rollover" />
      <RolloverForm
        action={runRollover.bind(
          null,
          slug,
          classes.map((c) => c.id),
        )}
        currentYear={year.name}
        defaults={{ name: nextYearName(year.name), startsOn: shiftYear(year.startsOn), endsOn: shiftYear(year.endsOn) }}
        grades={grades.map((g) => ({ id: g.id, name: g.name }))}
        classes={classes.map((c, i) => ({
          id: c.id,
          name: c.name,
          gradeName: c.gradeName,
          plan: plans[i],
          learners: learners[i].map((l) => ({ id: l.id, name: `${l.preferredName || l.firstName} ${l.lastName}` })),
        }))}
      />
    </>
  );
}
