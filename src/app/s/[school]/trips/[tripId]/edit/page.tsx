import { notFound } from "next/navigation";
import { NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { toLocalInput } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { getTrip, listGrades, listTripGrades } from "@/server/trips";
import { updateTrip } from "../../actions";
import { TripForm } from "../../forms";

export const metadata = { title: "Edit trip" };

export default async function EditTripPage({ params }: PageProps<"/s/[school]/trips/[tripId]/edit">) {
  const { school: slug, tripId } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "trips.manage")) return <NoAccess />;
  if (!isUuid(tripId)) notFound();
  const [row, grades, tripGrades] = await Promise.all([
    getTrip(ctx.school.id, tripId),
    listGrades(ctx.school.id),
    listTripGrades(ctx.school.id, tripId),
  ]);
  if (!row) notFound();
  const { trip } = row;
  const tz = ctx.school.timezone;

  return (
    <>
      <PageHeader title={`Edit ${trip.title}`} back={{ href: `/s/${slug}/trips/${tripId}`, label: "Back to trip" }} />
      <TripForm
        action={updateTrip.bind(null, slug, tripId)}
        trip={{
          ...trip,
          departsAt: toLocalInput(trip.departsAt, tz),
          returnsAt: trip.returnsAt ? toLocalInput(trip.returnsAt, tz) : null,
          cost: (trip.costCents / 100).toFixed(2),
        }}
        grades={grades}
        gradeIds={tripGrades.map((g) => g.id)}
        submitLabel="Save changes"
      />
    </>
  );
}
