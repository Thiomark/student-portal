import { notFound } from "next/navigation";
import { Badge, DefinitionList, NoAccess, PageHeader, Section } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDateTime, formatMoney } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { MAINTENANCE_CATEGORY_LABELS, MAINTENANCE_STATUS_LABELS } from "@/lib/validation/maintenance";
import { canSeeMaintenance, getMaintenance } from "@/server/maintenance";
import { updateMaintenance } from "../actions";
import { ManageRequestForm } from "../forms";

const STATUS_TONE = { open: "amber", in_progress: "blue", done: "green", cancelled: "gray" } as const;

export default async function MaintenanceRequestPage({
  params,
}: PageProps<"/s/[school]/maintenance/[requestId]">) {
  const { school: slug, requestId } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "maintenance.view") && !can(ctx, "maintenance.report")) return <NoAccess />;
  if (!isUuid(requestId)) notFound();
  const row = await getMaintenance(ctx.school.id, requestId);
  if (!row) notFound();
  const { request } = row;
  if (!canSeeMaintenance(ctx, request)) return <NoAccess />;

  const tz = ctx.school.timezone;
  return (
    <>
      <PageHeader
        title={request.title}
        description={[request.location, MAINTENANCE_CATEGORY_LABELS[request.category]].filter(Boolean).join(" · ")}
        back={{ href: `/s/${slug}/maintenance`, label: "Maintenance" }}
      />

      <Section title="Details">
        <DefinitionList
          items={[
            [
              "Status",
              <Badge key="s" tone={STATUS_TONE[request.status]}>
                {MAINTENANCE_STATUS_LABELS[request.status]}
              </Badge>,
            ],
            ["Priority", <Badge key="p" tone={request.priority === "urgent" ? "red" : "gray"}>{request.priority}</Badge>],
            ["Reported", `${formatDateTime(request.createdAt, tz)}${row.reporterName ? ` by ${row.reporterName}` : ""}`],
            ["Assigned to", request.assignedTo],
            ["Vendor", request.vendor],
            ["Cost", request.costCents === null ? null : formatMoney(request.costCents, ctx.school.currency)],
            ["Completed", request.completedAt ? formatDateTime(request.completedAt, tz) : null],
          ]}
        />
        {request.description ? <p className="mt-4 text-sm whitespace-pre-line">{request.description}</p> : null}
      </Section>

      {can(ctx, "maintenance.manage") ? (
        <Section title="Update">
          <ManageRequestForm
            action={updateMaintenance.bind(null, slug, requestId)}
            request={{
              ...request,
              cost: request.costCents === null ? "" : (request.costCents / 100).toFixed(2),
            }}
          />
        </Section>
      ) : null}
    </>
  );
}
