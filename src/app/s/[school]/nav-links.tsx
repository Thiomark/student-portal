"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; fullLoad?: boolean };

export function NavLinks({ items }: { items: Item[] }) {
  const pathname = usePathname();
  const root = items[0]?.href;
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible">
      {items.map((item) => {
        const active = item.href === root ? pathname === root : pathname.startsWith(item.href);
        const className = `rounded-md px-3 py-2 text-sm whitespace-nowrap ${
          active ? "bg-brand-50 font-medium text-brand-800" : "text-slate-700 hover:bg-slate-100"
        }`;
        // Offline pages are opened with a full page load so the service
        // worker can answer from its cache when there's no connection.
        return item.fullLoad ? (
          <a key={item.href} href={item.href} className={className}>
            {item.label}
          </a>
        ) : (
          <Link key={item.href} href={item.href} className={className}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
