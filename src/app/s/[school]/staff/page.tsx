import Link from "next/link";
import { Badge, EmptyState, NoAccess, PageHeader, Section } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { fullName } from "@/lib/format";
import { isStaffPreset, STAFF_PRESET_LABELS } from "@/lib/permissions";
import { listLogins, listStaff } from "@/server/staff";

export const metadata = { title: "Staff" };

export default async function StaffPage({ params }: PageProps<"/s/[school]/staff">) {
  const { school: slug } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "staff.view")) return <NoAccess />;
  const [rows, logins] = await Promise.all([listStaff(ctx.school.id), listLogins(ctx.school.id)]);
  const manage = can(ctx, "staff.manage");
  const base = `/s/${slug}/staff`;
  const withoutRecord = logins.filter((l) => !l.membership.staffId);

  return (
    <>
      <PageHeader
        title="Staff"
        actions={
          manage ? (
            <Link href={`${base}/new`} className="btn-primary">
              Add staff member
            </Link>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No staff yet">Add teachers and other staff, then invite them to sign in.</EmptyState>
      ) : (
        <div className="card mb-6 overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Position</th>
                <th>Status</th>
                <th>Sign-in access</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ staff, membership }) => (
                <tr key={staff.id}>
                  <td>
                    <Link href={`${base}/${staff.id}`} className="link font-medium">
                      {[staff.title, fullName(staff)].filter(Boolean).join(" ")}
                    </Link>
                  </td>
                  <td>{staff.position ?? "—"}</td>
                  <td>
                    <Badge tone={staff.status === "active" ? "green" : "gray"}>{staff.status.replace("_", " ")}</Badge>
                  </td>
                  <td>
                    {membership ? (
                      <span className="capitalize">
                        {membership.role === "staff" && isStaffPreset(membership.permissions.preset)
                          ? STAFF_PRESET_LABELS[membership.permissions.preset]
                          : membership.role}
                      </span>
                    ) : (
                      <span className="text-slate-400">No login</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {withoutRecord.length > 0 ? (
        <Section title="Logins without a staff record">
          <ul className="space-y-1 text-sm">
            {withoutRecord.map(({ membership, user }) => (
              <li key={membership.id}>
                {manage ? (
                  <Link href={`${base}/access/${membership.id}`} className="link">
                    {user.name ?? user.email ?? "Unnamed"}
                  </Link>
                ) : (
                  (user.name ?? user.email)
                )}{" "}
                <span className="text-slate-500 capitalize">{membership.role}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
