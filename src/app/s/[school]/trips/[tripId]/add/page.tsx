import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, EmptyState, NoAccess, PageHeader, Section } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { fullName } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { listLearners } from "@/server/school-data";
import { getTrip, listParticipants, listTripGrades } from "@/server/trips";
import { addGradeParticipants, addParticipantForm } from "../../actions";
import { ButtonForm } from "../../forms";

export const metadata = { title: "Add participants" };

export default async function AddParticipantsPage({
  params,
  searchParams,
}: PageProps<"/s/[school]/trips/[tripId]/add">) {
  const { school: slug, tripId } = await params;
  const { q: qParam } = await searchParams;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "trips.manage")) return <NoAccess />;
  if (!isUuid(tripId)) notFound();
  const row = await getTrip(ctx.school.id, tripId);
  if (!row) notFound();

  const q = typeof qParam === "string" ? qParam.trim() : "";
  const [grades, participants, found] = await Promise.all([
    listTripGrades(ctx.school.id, tripId),
    listParticipants(ctx.school.id, tripId),
    q ? listLearners(ctx.school.id, { q, status: "active" }) : Promise.resolve({ rows: [] }),
  ]);
  const onTrip = new Set(participants.map((p) => p.learnerId));
  const base = `/s/${slug}/trips/${tripId}`;

  return (
    <>
      <PageHeader
        title={`Add participants: ${row.trip.title}`}
        description={`${participants.length} on the list so far.`}
        back={{ href: base, label: "Back to trip" }}
      />

      <Section title="Whole grades">
        {grades.length === 0 ? (
          <p className="text-sm text-slate-600">
            No grades chosen for this trip.{" "}
            <Link href={`${base}/edit`} className="link">
              Choose grades
            </Link>
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-600">
              Adds every active learner in {grades.map((g) => g.name).join(", ")} this year. Learners already on the
              list are skipped.
            </p>
            <ButtonForm
              action={addGradeParticipants.bind(null, slug, tripId)}
              label="Add all learners in these grades"
              className="btn-primary"
            />
          </>
        )}
      </Section>

      <Section title="One learner">
        <form className="mb-4 flex gap-2" role="search">
          <input name="q" defaultValue={q} placeholder="Name or admission number" className="input max-w-xs" />
          <button className="btn-secondary">Search</button>
        </form>
        {q && found.rows.length === 0 ? <EmptyState title="No learners match" /> : null}
        {found.rows.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {found.rows.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-medium">{fullName(l)}</span>{" "}
                  <span className="text-sm text-slate-500">{l.className ?? "No class"}</span>
                </span>
                {onTrip.has(l.id) ? (
                  <Badge tone="green">On the trip</Badge>
                ) : (
                  <form action={addParticipantForm.bind(null, slug, tripId, l.id)}>
                    <button className="btn-secondary">Add</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
    </>
  );
}
