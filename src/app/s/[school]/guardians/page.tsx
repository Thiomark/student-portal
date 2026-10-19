import Link from "next/link";
import { Badge, EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { CHANNEL_LABELS } from "@/lib/messaging/channel";
import { searchGuardians } from "@/server/school-data";

export const metadata = { title: "Parents & guardians" };

export default async function GuardiansPage({ params, searchParams }: PageProps<"/s/[school]/guardians">) {
  const { school: slug } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "guardians.view")) return <NoAccess />;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const rows = await searchGuardians(ctx.school.id, q, 100);
  const base = `/s/${slug}/guardians`;

  return (
    <>
      <PageHeader
        title="Parents & guardians"
        actions={
          can(ctx, "guardians.manage") ? (
            <Link href={`${base}/new`} className="btn-primary">
              Add parent
            </Link>
          ) : null
        }
      />
      <form className="mb-4 flex gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Name, phone or email" className="input max-w-xs" />
        <button className="btn-secondary">Search</button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title={q ? "No parents match" : "No parents yet"}>
          Parents are usually added from a learner&apos;s page.
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Children</th>
                <th>Prefers</th>
                <th>Portal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id}>
                  <td>
                    <Link href={`${base}/${g.id}`} className="link font-medium">
                      {[g.title, g.firstName, g.lastName].filter(Boolean).join(" ")}
                    </Link>
                  </td>
                  <td>{g.childCount}</td>
                  <td>{g.preferredChannel ? CHANNEL_LABELS[g.preferredChannel] : "—"}</td>
                  <td>{g.hasPortal ? <Badge tone="green">Signed in</Badge> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
