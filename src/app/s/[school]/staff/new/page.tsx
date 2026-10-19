import { NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { saveStaff } from "../actions";
import { StaffForm } from "../forms";

export const metadata = { title: "Add staff member" };

export default async function NewStaffPage({ params }: PageProps<"/s/[school]/staff/new">) {
  const { school: slug } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "staff.manage")) return <NoAccess />;
  return (
    <>
      <PageHeader title="Add staff member" back={{ href: `/s/${slug}/staff`, label: "Staff" }} />
      <StaffForm action={saveStaff.bind(null, slug, null)} />
    </>
  );
}
