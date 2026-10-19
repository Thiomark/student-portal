import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui";
import { isPlatformAdmin, listMyGuardianLinks, listMySchools, requireUser } from "@/lib/auth/context";
import { claimInvites, claimGuardianRecords } from "@/server/claims";

export const metadata = { title: "Your schools" };

export default async function SchoolsPage() {
  const user = await requireUser();
  // Pick up any staff invites and guardian records that match this person's
  // verified email or phone before deciding where to send them.
  await Promise.all([claimInvites(user), claimGuardianRecords(user)]);

  const [schools, guardianLinks, platformAdmin] = await Promise.all([
    listMySchools(user.id),
    listMyGuardianLinks(user.id),
    isPlatformAdmin(user.id),
  ]);

  if (schools.length === 1 && guardianLinks.length === 0 && !platformAdmin) {
    redirect(`/s/${schools[0].slug}`);
  }
  if (schools.length === 0 && guardianLinks.length > 0 && !platformAdmin) {
    redirect("/portal");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your schools</h1>
        <UserButton />
      </div>
      {schools.length === 0 && guardianLinks.length === 0 ? (
        <EmptyState title="You're not linked to a school yet">
          Ask your school to invite you using{" "}
          <strong>{user.email ?? user.phone ?? "your email address"}</strong>. Parents are linked automatically
          when the school has your email or cellphone number on record.
        </EmptyState>
      ) : null}
      <ul className="space-y-2">
        {schools.map((s) => (
          <li key={s.id}>
            <Link href={`/s/${s.slug}`} className="card flex items-center justify-between p-4 hover:border-brand-600">
              <span className="font-medium">{s.name}</span>
              <span className="text-sm text-slate-500 capitalize">{s.role}</span>
            </Link>
          </li>
        ))}
        {guardianLinks.length > 0 ? (
          <li>
            <Link href="/portal" className="card flex items-center justify-between p-4 hover:border-brand-600">
              <span className="font-medium">Parent portal</span>
              <span className="text-sm text-slate-500">Your children</span>
            </Link>
          </li>
        ) : null}
      </ul>
      {platformAdmin ? (
        <p className="mt-8 text-sm">
          <Link href="/platform" className="link">
            Platform: add a school →
          </Link>
        </p>
      ) : null}
    </main>
  );
}
