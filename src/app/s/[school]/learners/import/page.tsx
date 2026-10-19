import { NoAccess, PageHeader, Section } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { MAX_IMPORT_ROWS } from "@/lib/import/learners";
import { Importer } from "./importer";

export const metadata = { title: "Import learners" };

export default async function ImportPage({ params }: PageProps<"/s/[school]/learners/import">) {
  const { school: slug } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "learners.manage") || !can(ctx, "guardians.manage")) return <NoAccess />;

  return (
    <>
      <PageHeader
        title="Import learners and parents"
        description="From a spreadsheet: SA-SAMS export, Excel or Google Sheets saved as CSV."
        back={{ href: `/s/${slug}/learners`, label: "Learners" }}
      />
      <Section title="1. Prepare the file">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>
            One row per learner. Needed: <strong>first name</strong> and <strong>surname</strong>. Also read:
            admission number, date of birth, gender, class, home language, and up to two parents (name,
            relationship, cell, WhatsApp Y/N, email).
          </li>
          <li>
            Column names are flexible: &quot;Adm No&quot;, &quot;Mother Cell&quot;, &quot;Parent 2 Email&quot; all work.
            Dates can be 14/03/2014 or 2014-03-14.
          </li>
          <li>
            Learners with an admission number already on file are <strong>updated</strong>, not duplicated. Parents
            whose cell or email is already on file are <strong>reused</strong>, so siblings share one parent.
          </li>
          <li>
            Cellphones are assumed to have WhatsApp unless the WhatsApp column says N. Landlines never do.
          </li>
          <li>Up to {MAX_IMPORT_ROWS} rows per file.</li>
        </ul>
        <a href={`/s/${slug}/learners/import/template`} className="btn-secondary mt-3">
          Download a template
        </a>
      </Section>
      <Importer slug={slug} />
    </>
  );
}
