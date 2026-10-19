import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, DefinitionList, NoAccess, PageHeader, Section } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDate, fullName } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { getClassGroup, listClassLearners, staffName } from "@/server/classes";

export default async function ClassPage({ params }: PageProps<"/s/[school]/classes/[classId]">) {
  const { school: slug, classId } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "classes.manage")) return <NoAccess />;
  if (!isUuid(classId)) notFound();

  const [row, learners] = await Promise.all([
    getClassGroup(ctx.school.id, classId),
    listClassLearners(ctx.school.id, classId),
  ]);
  if (!row) notFound();
  const { classGroup } = row;
  const base = `/s/${slug}`;
  const linkLearners = can(ctx, "learners.view");

  return (
    <>
      <PageHeader
        title={`Class ${classGroup.name}`}
        description={`${row.gradeName} · ${row.yearName}${row.yearIsCurrent ? "" : " (not the current year)"}`}
        back={{ href: `${base}/classes`, label: "Classes" }}
        actions={
          <Link href={`${base}/classes/${classId}/edit`} className="btn-secondary">
            Edit
          </Link>
        }
      />

      <Section title="Details">
        <DefinitionList
          items={[
            ["Grade", row.gradeName],
            ["Academic year", row.yearName],
            ["Class teacher", row.teacher ? staffName(row.teacher) : null],
            ["Room", classGroup.room],
          ]}
        />
      </Section>

      <Section
        title={`Learners (${learners.length})`}
        actions={
          can(ctx, "learners.view") ? (
            <Link href={`${base}/learners?class=${classId}`} className="text-sm link">
              Open in learners
            </Link>
          ) : null
        }
      >
        {learners.length === 0 ? (
          <p className="text-sm text-slate-600">
            No learners in this class yet. Set a learner&apos;s class from their page.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Admission no.</th>
                  <th>In class since</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {learners.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {linkLearners ? (
                        <Link href={`${base}/learners/${l.id}`} className="link font-medium">
                          {fullName(l)}
                        </Link>
                      ) : (
                        fullName(l)
                      )}
                    </td>
                    <td>{l.admissionNumber ?? "—"}</td>
                    <td>{formatDate(l.startedOn, "UTC")}</td>
                    <td>{l.status === "active" ? l.status : <Badge tone="amber">{l.status}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
