import Link from "next/link";

const TABS = [
  { href: "", label: "Classes" },
  { href: "/years", label: "Academic years" },
  { href: "/grades", label: "Grades" },
  { href: "/subjects", label: "Subjects" },
] as const;

// Tabs across the academic setup pages. Server-rendered; the current tab is
// passed in rather than read from the URL on the client.
export function ClassesNav({ slug, current }: { slug: string; current: (typeof TABS)[number]["href"] }) {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={`/s/${slug}/classes${t.href}`}
          aria-current={t.href === current ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap ${
            t.href === current
              ? "border-brand-600 font-medium text-brand-800"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
