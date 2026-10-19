import { Badge, NoAccess, PageHeader, Section } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDate } from "@/lib/format";
import { listAcademicYears } from "@/server/classes";
import { createAcademicYear, setCurrentYear } from "../actions";
import { AcademicYearForm, ActionButton } from "../forms";
import { ClassesNav } from "../section-nav";

export const metadata = { title: "Academic years" };

export default async function AcademicYearsPage({ params }: PageProps<"/s/[school]/classes/years">) {
  const { school: slug } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "classes.manage")) return <NoAccess />;

  const years = await listAcademicYears(ctx.school.id);
  const hasCurrent = years.some((y) => y.isCurrent);

  return (
    <>
      <PageHeader
        title="Academic years"
        description="The current year decides which classes learners are placed in and which loans count."
      />
      <ClassesNav slug={slug} current="/years" />

      <Section title="Years">
        {years.length === 0 ? (
          <p className="text-sm text-slate-600">No academic years yet. Add the first one below.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Starts</th>
                  <th>Ends</th>
                  <th className="text-right">Classes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.id}>
                    <td className="font-medium">{y.name}</td>
                    <td>{formatDate(y.startsOn, "UTC")}</td>
                    <td>{formatDate(y.endsOn, "UTC")}</td>
                    <td className="text-right">{y.classCount}</td>
                    <td className="text-right">
                      {y.isCurrent ? (
                        <Badge tone="green">Current</Badge>
                      ) : (
                        <ActionButton
                          action={setCurrentYear.bind(null, slug, y.id)}
                          confirmText={`Make ${y.name} the current year? Class lists and the textbook desk will switch to it.`}
                        >
                          Make current
                        </ActionButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Add a year">
        <AcademicYearForm action={createAcademicYear.bind(null, slug)} hasCurrent={hasCurrent} />
        <p className="mt-4 text-xs text-slate-500">
          Promoting learners into the new year&apos;s classes isn&apos;t automated yet.
        </p>
      </Section>
    </>
  );
}
