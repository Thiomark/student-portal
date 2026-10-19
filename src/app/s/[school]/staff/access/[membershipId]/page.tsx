import { notFound } from "next/navigation";
import { NoAccess, PageHeader, Section } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { isUuid } from "@/lib/ids";
import { canManageRole, isStaffPreset, resolveCapabilities } from "@/lib/permissions";
import { getMembership } from "@/server/staff";
import { revokeAccess, updateAccess } from "../../actions";
import { AccessForm } from "../../forms";

export const metadata = { title: "Access" };

export default async function AccessPage({ params }: PageProps<"/s/[school]/staff/access/[membershipId]">) {
  const { school: slug, membershipId } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "staff.manage")) return <NoAccess />;
  if (!isUuid(membershipId)) notFound();
  const row = await getMembership(ctx.school.id, membershipId);
  if (!row || row.membership.status !== "active") notFound();
  const { membership, user } = row;
  const self = membership.id === ctx.membership.id;
  const allowed = !self && canManageRole(ctx.membership.role, membership.role);
  const back = membership.staffId ? `/s/${slug}/staff/${membership.staffId}` : `/s/${slug}/staff`;

  return (
    <>
      <PageHeader title={`Access for ${user.name ?? user.email ?? "user"}`} description={user.email} back={{ href: back, label: "Back" }} />
      {!allowed ? (
        <p className="text-sm text-slate-600">
          {self ? "You can't change your own access." : "Only an owner can change an owner's access."}
        </p>
      ) : (
        <>
          <Section title="What they can do">
            <AccessForm
              action={updateAccess.bind(null, slug, membershipId)}
              actorRole={ctx.membership.role}
              role={membership.role}
              preset={isStaffPreset(membership.permissions.preset) ? membership.permissions.preset : "teacher"}
              capabilities={resolveCapabilities(membership.role, membership.permissions)}
            />
          </Section>
          <Section title="Remove access">
            <form action={revokeAccess.bind(null, slug, membershipId)}>
              <p className="mb-2 text-sm text-slate-600">They will no longer be able to open this school. Their history stays.</p>
              <button className="btn-danger">Remove access</button>
            </form>
          </Section>
        </>
      )}
    </>
  );
}
