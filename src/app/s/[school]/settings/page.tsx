import { eq } from "drizzle-orm";
import { NoAccess, PageHeader, Section } from "@/components/ui";
import { getDb, schema } from "@/db/client";
import { can, getSchoolContext } from "@/lib/auth/context";
import { updateSchoolDetails, updateSecrets } from "./actions";
import { DetailsForm, SecretsForm } from "./forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ params }: PageProps<"/s/[school]/settings">) {
  const { school: slug } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "school.settings")) return <NoAccess />;
  const [secrets] = await getDb()
    .select()
    .from(schema.schoolSecrets)
    .where(eq(schema.schoolSecrets.schoolId, ctx.school.id));

  return (
    <>
      <PageHeader title="Settings" />
      <Section title="School details">
        <DetailsForm action={updateSchoolDetails.bind(null, slug)} school={ctx.school} />
      </Section>
      <Section title="WhatsApp and email">
        <SecretsForm
          action={updateSecrets.bind(null, slug)}
          hasWhaple={Boolean(secrets?.whapleApiKey)}
          hasResend={Boolean(secrets?.resendApiKey)}
          resendFromEmail={secrets?.resendFromEmail ?? null}
        />
      </Section>
    </>
  );
}
