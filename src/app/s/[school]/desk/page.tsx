import { NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { TextbookDesk } from "./desk";

export const metadata = { title: "Textbook desk" };

// The HTML for this page holds no learner data (the desk reads it from the
// device), so the service worker may keep it for offline use. See proxy.ts.
export default async function DeskPage({ params }: PageProps<"/s/[school]/desk">) {
  const { school: slug } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "textbooks.issue")) return <NoAccess />;
  return (
    <>
      <PageHeader
        title="Textbook desk"
        description="Issue and take back books. Works offline; changes are sent when you're back online."
      />
      <TextbookDesk schoolId={ctx.school.id} slug={slug} />
    </>
  );
}
