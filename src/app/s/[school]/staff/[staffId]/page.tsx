import Link from "next/link";
import { notFound } from "next/navigation";
import { NoAccess, PageHeader, Section } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDate, fullName } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { getMembershipForStaff, getOpenInvite, getStaffMember } from "@/server/staff";
import { inviteStaff, saveStaff } from "../actions";
import { InviteForm, StaffForm } from "../forms";

export default async function StaffMemberPage({ params }: PageProps<"/s/[school]/staff/[staffId]">) {
  const { school: slug, staffId } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "staff.view")) return <NoAccess />;
  if (!isUuid(staffId)) notFound();
  const member = await getStaffMember(ctx.school.id, staffId);
  if (!member) notFound();
  const manage = can(ctx, "staff.manage");
  const login = manage ? await getMembershipForStaff(ctx.school.id, staffId) : null;
  const invite = manage && !login ? await getOpenInvite(ctx.school.id, staffId) : null;

  return (
    <>
      <PageHeader title={fullName(member)} description={member.position} back={{ href: `/s/${slug}/staff`, label: "Staff" }} />
      {manage ? (
        <>
          <Section title="Sign-in access">
            {login ? (
              <p className="text-sm">
                Signs in as <strong>{login.user.email ?? login.user.name}</strong> ({login.membership.role}).{" "}
                <Link href={`/s/${slug}/staff/access/${login.membership.id}`} className="link">
                  Change access
                </Link>
              </p>
            ) : (
              <>
                {invite ? (
                  <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Invited {invite.email} — waiting for them to sign in (expires{" "}
                    {formatDate(invite.expiresAt, ctx.school.timezone)}). Sending again replaces it.
                  </p>
                ) : null}
                <InviteForm
                  action={inviteStaff.bind(null, slug, staffId)}
                  email={member.email}
                  actorRole={ctx.membership.role}
                />
              </>
            )}
          </Section>
          <Section title="Details">
            <StaffForm action={saveStaff.bind(null, slug, staffId)} staff={member} />
          </Section>
        </>
      ) : (
        <Section title="Details">
          <p className="text-sm">{[member.phone, member.email].filter(Boolean).join(" · ") || "No contact details"}</p>
        </Section>
      )}
    </>
  );
}
