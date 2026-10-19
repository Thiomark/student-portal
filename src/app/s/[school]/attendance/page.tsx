import Link from "next/link";
import { NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { Register } from "./register";

export const metadata = { title: "Attendance" };

// Like the textbook desk, this page's HTML holds no learner data (it reads the
// device's copy), so the service worker may keep it for offline use.
export default async function AttendancePage({ params }: PageProps<"/s/[school]/attendance">) {
  const { school: slug } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "attendance.take") && !can(ctx, "attendance.view")) return <NoAccess />;

  return (
    <>
      <PageHeader
        title="Attendance register"
        description="Works offline. Registers are sent when you're back online."
        actions={
          can(ctx, "attendance.view") ? (
            <Link href={`/s/${slug}/attendance/today`} className="btn-secondary">
              Whole school today
            </Link>
          ) : null
        }
      />
      {can(ctx, "attendance.take") ? (
        <Register
          schoolId={ctx.school.id}
          slug={slug}
          timeZone={ctx.school.timezone}
          myStaffId={ctx.membership.staffId}
        />
      ) : (
        <p className="text-sm text-slate-600">You can view attendance but not take registers.</p>
      )}
    </>
  );
}
