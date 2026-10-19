import Link from "next/link";

const TABS = [
  { href: "", label: "Titles" },
  { href: "/loans", label: "Loans & losses" },
] as const;

export function TextbooksNav({ slug, current }: { slug: string; current: (typeof TABS)[number]["href"] }) {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={`/s/${slug}/textbooks${t.href}`}
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

// Issuing and returning happen at the desk, which works offline.
export function DeskButton({ slug, className = "btn-secondary" }: { slug: string; className?: string }) {
  return (
    <Link href={`/s/${slug}/desk`} className={className}>
      Open textbook desk
    </Link>
  );
}

export const CONDITION_TONE = {
  new: "green",
  good: "green",
  fair: "gray",
  poor: "amber",
  damaged: "red",
} as const;

export const STATUS_TONE = {
  available: "green",
  issued: "blue",
  lost: "red",
  written_off: "gray",
} as const;
