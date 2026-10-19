import { desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionForm, Field, SubmitButton } from "@/components/action-form";
import { PageHeader, Section } from "@/components/ui";
import { getDb, schema } from "@/db/client";
import { isPlatformAdmin, requireUser } from "@/lib/auth/context";
import { formatDate } from "@/lib/format";
import { createSchool } from "./actions";

export const metadata = { title: "Platform" };

export default async function PlatformPage() {
  const user = await requireUser();
  if (!(await isPlatformAdmin(user.id))) notFound();
  const schools = await getDb()
    .select({ id: schema.schools.id, name: schema.schools.name, slug: schema.schools.slug, createdAt: schema.schools.createdAt })
    .from(schema.schools)
    .orderBy(desc(schema.schools.createdAt));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader title="Platform" back={{ href: "/schools", label: "Your schools" }} />
      <Section title="Add a school">
        <ActionForm action={createSchool} className="space-y-4" resetOnSuccess>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="name" label="School name">
              <input id="name" name="name" className="input" required />
            </Field>
            <Field name="slug" label="Web address" hint="Used in links: /s/your-school">
              <input id="slug" name="slug" className="input" required pattern="[a-z0-9-]+" />
            </Field>
            <Field name="ownerEmail" label="Principal's email" hint="They become the school's owner.">
              <input id="ownerEmail" name="ownerEmail" type="email" className="input" required />
            </Field>
            <Field name="timezone" label="Timezone">
              <input id="timezone" name="timezone" className="input" defaultValue="Africa/Johannesburg" />
            </Field>
          </div>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="saGrades" defaultChecked /> Add Grade R to Grade 12
          </label>
          <SubmitButton>Create school</SubmitButton>
        </ActionForm>
      </Section>
      <Section title={`Schools (${schools.length})`}>
        <ul className="space-y-1 text-sm">
          {schools.map((s) => (
            <li key={s.id}>
              <span className="font-medium">{s.name}</span> <span className="text-slate-500">/s/{s.slug}</span>{" "}
              <span className="text-slate-400">· {formatDate(s.createdAt, "Africa/Johannesburg")}</span>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}
