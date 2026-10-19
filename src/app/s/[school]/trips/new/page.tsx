import { NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { listGrades } from "@/server/trips";
import { createTrip } from "../actions";
import { TripForm } from "../forms";

export const metadata = { title: "New trip" };

export default async function NewTripPage({ params }: PageProps<"/s/[school]/trips/new">) {
  const { school: slug } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "trips.manage")) return <NoAccess />;
  const grades = await listGrades(ctx.school.id);

  return (
    <>
      <PageHeader title="New trip" back={{ href: `/s/${slug}/trips`, label: "Trips" }} />
      <TripForm action={createTrip.bind(null, slug)} grades={grades} gradeIds={[]} submitLabel="Save trip" />
    </>
  );
}
