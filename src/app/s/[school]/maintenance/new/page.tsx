import { NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { reportMaintenance } from "../actions";
import { NewRequestForm } from "../forms";

export const metadata = { title: "Report a maintenance problem" };

export default async function NewMaintenancePage({ params }: PageProps<"/s/[school]/maintenance/new">) {
  const { school: slug } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "maintenance.report")) return <NoAccess />;
  const viewAll = can(ctx, "maintenance.view");

  return (
    <>
      <PageHeader
        title="Report a maintenance problem"
        back={{ href: `/s/${slug}/maintenance`, label: viewAll ? "Maintenance" : "My requests" }}
      />
      {/* Reporters who can't open the request stay here, so clear the form for the next one. */}
      <NewRequestForm action={reportMaintenance.bind(null, slug)} resetOnSuccess={!viewAll} />
    </>
  );
}
