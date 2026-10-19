import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { getSchoolContext } from "@/lib/auth/context";
import { SCHOOL_NAV } from "@/lib/nav";
import { NavLinks } from "./nav-links";

export default async function SchoolLayout({ children, params }: LayoutProps<"/s/[school]">) {
  const { school: slug } = await params;
  const ctx = await getSchoolContext(slug);
  const items = SCHOOL_NAV.filter(
    (item) => !item.capability || [item.capability].flat().some((c) => ctx.capabilities.has(c)),
  ).map(
    (item) => ({ href: `/s/${slug}${item.href}`, label: item.label, fullLoad: item.fullLoad }),
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <Link href="/schools" className="truncate font-semibold" title="Switch school">
            {ctx.school.name}
          </Link>
          <UserButton />
        </div>
        <NavLinks items={items} />
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}
