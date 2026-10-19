import { notFound } from "next/navigation";
import { NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { fullName, toLocalInput } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { canEditIncident, getIncident } from "@/server/incidents";
import { updateIncident } from "../../actions";
import { IncidentForm } from "../../forms";

export const metadata = { title: "Edit incident" };

export default async function EditIncidentPage({ params }: PageProps<"/s/[school]/incidents/[incidentId]/edit">) {
  const { school: slug, incidentId } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "incidents.view")) return <NoAccess />;
  if (!isUuid(incidentId)) notFound();
  const row = await getIncident(ctx.school.id, incidentId);
  if (!row) notFound();
  if (!canEditIncident(ctx, row.incident)) return <NoAccess />;

  const tz = ctx.school.timezone;
  const now = toLocalInput(new Date(), tz);
  return (
    <>
      <PageHeader
        title={`Edit incident: ${fullName(row.learner)}`}
        back={{ href: `/s/${slug}/incidents/${incidentId}`, label: "Back to incident" }}
      />
      <IncidentForm
        action={updateIncident.bind(null, slug, incidentId)}
        incident={{ ...row.incident, occurredAt: toLocalInput(row.incident.occurredAt, tz) }}
        maxOccurredAt={now.slice(0, 10) + "T23:59"}
        submitLabel="Save changes"
      />
    </>
  );
}
