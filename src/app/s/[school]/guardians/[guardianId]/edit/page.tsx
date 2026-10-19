import { notFound } from "next/navigation";
import { NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { fullName } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { getGuardian } from "@/server/school-data";
import { updateGuardian } from "../../actions";
import { EditGuardianForm } from "../../forms";

export const metadata = { title: "Edit parent" };

export default async function EditGuardianPage({ params }: PageProps<"/s/[school]/guardians/[guardianId]/edit">) {
  const { school: slug, guardianId } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "guardians.manage")) return <NoAccess />;
  if (!isUuid(guardianId)) notFound();
  const guardian = await getGuardian(ctx.school.id, guardianId);
  if (!guardian) notFound();
  return (
    <>
      <PageHeader
        title={`Edit ${fullName(guardian)}`}
        back={{ href: `/s/${slug}/guardians/${guardianId}`, label: "Back" }}
      />
      <EditGuardianForm action={updateGuardian.bind(null, slug, guardianId)} guardian={guardian} />
    </>
  );
}
