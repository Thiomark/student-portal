import { Badge } from "@/components/ui";

type Contact = {
  id: string;
  kind: "phone" | "email";
  value: string;
  label: string | null;
  whatsapp: boolean;
  sms: boolean;
  voice: boolean;
  isPrimary: boolean;
};

// Shows each number with what it can be used for, so staff know at a glance
// whether to WhatsApp, SMS or phone.
export function ContactList({ contacts, remove }: { contacts: Contact[]; remove?: (contactId: string) => React.ReactNode }) {
  if (contacts.length === 0) {
    return (
      <p className="text-sm text-amber-800">
        No phone or email. Notices for this parent are printed as letters.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {contacts.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-1.5 text-sm">
          {c.kind === "phone" ? (
            <a href={`tel:${c.value}`} className="link font-mono">
              {c.value}
            </a>
          ) : (
            <a href={`mailto:${c.value}`} className="link">
              {c.value}
            </a>
          )}
          {c.label ? <span className="text-slate-500">({c.label})</span> : null}
          {c.whatsapp ? <Badge tone="green">WhatsApp</Badge> : null}
          {c.sms ? <Badge tone="blue">SMS</Badge> : null}
          {c.voice ? <Badge>Calls</Badge> : null}
          {c.isPrimary ? <Badge tone="amber">Main number</Badge> : null}
          {remove ? remove(c.id) : null}
        </li>
      ))}
    </ul>
  );
}
