import type { Capability } from "@/lib/permissions";

// One registry for the school sidebar. Pages still check the capability on
// the server; this only decides what to show.
// `capability` shows the item to anyone holding any of the listed ones.
export const SCHOOL_NAV: {
  href: string;
  label: string;
  capability?: Capability | Capability[];
  fullLoad?: boolean;
}[] = [
  { href: "", label: "Overview" },
  { href: "/desk", label: "Textbook desk", capability: "textbooks.issue", fullLoad: true },
  { href: "/learners", label: "Learners", capability: "learners.view" },
  { href: "/guardians", label: "Parents & guardians", capability: "guardians.view" },
  { href: "/classes", label: "Classes", capability: "classes.manage" },
  { href: "/textbooks", label: "Textbooks", capability: "textbooks.view" },
  { href: "/meetings", label: "Meetings", capability: "meetings.view" },
  { href: "/messages", label: "Messages", capability: "messages.send" },
  { href: "/incidents", label: "Incidents", capability: ["incidents.view", "incidents.report"] },
  { href: "/trips", label: "Trips", capability: "trips.view" },
  // Teachers can report problems without seeing everyone's requests.
  { href: "/maintenance", label: "Maintenance", capability: ["maintenance.view", "maintenance.report"] },
  { href: "/staff", label: "Staff", capability: "staff.view" },
  { href: "/activity", label: "Activity log", capability: "activity.view" },
  { href: "/settings", label: "Settings", capability: "school.settings" },
];
