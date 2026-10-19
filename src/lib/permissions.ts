// Capability registry shared by the server, the UI and tests. Keep it free of
// imports so offline client code can use it too.
//
// The server checks a capability on every action; the UI only uses this to
// hide what someone can't do.

export const CAPABILITIES = [
  "school.settings",
  "staff.view",
  "staff.manage",
  "learners.view",
  "learners.manage",
  "guardians.view",
  "guardians.manage",
  "classes.manage",
  "attendance.view",
  "attendance.take",
  "textbooks.view",
  "textbooks.issue",
  "textbooks.manage",
  "meetings.view",
  "meetings.manage",
  "messages.send",
  "incidents.view",
  "incidents.report",
  "incidents.manage",
  "trips.view",
  "trips.manage",
  "trips.payments",
  "maintenance.view",
  "maintenance.report",
  "maintenance.manage",
  "activity.view",
] as const;

export type Capability = (typeof CAPABILITIES)[number];
export type Role = "owner" | "admin" | "staff";

const ALL = new Set<string>(CAPABILITIES);

export function isCapability(value: string): value is Capability {
  return ALL.has(value);
}

// Starting points for staff. A principal can grant or revoke individual
// capabilities on top of a preset.
export const STAFF_PRESETS = {
  teacher: [
    "learners.view",
    "guardians.view",
    "attendance.view",
    "attendance.take",
    "textbooks.view",
    "textbooks.issue",
    "meetings.view",
    "meetings.manage",
    "messages.send",
    "incidents.view",
    "incidents.report",
    "trips.view",
    "maintenance.report",
  ],
  office: [
    "staff.view",
    "learners.view",
    "learners.manage",
    "guardians.view",
    "guardians.manage",
    "classes.manage",
    "attendance.view",
    "attendance.take",
    "textbooks.view",
    "meetings.view",
    "meetings.manage",
    "messages.send",
    "incidents.view",
    "trips.view",
    "trips.payments",
    "maintenance.view",
    "maintenance.report",
  ],
  textbooks: ["learners.view", "textbooks.view", "textbooks.issue", "textbooks.manage"],
  finance: ["learners.view", "guardians.view", "trips.view", "trips.manage", "trips.payments"],
  facilities: ["maintenance.view", "maintenance.report", "maintenance.manage"],
  none: [],
} as const satisfies Record<string, readonly Capability[]>;

export type StaffPreset = keyof typeof STAFF_PRESETS;

export const STAFF_PRESET_LABELS: Record<StaffPreset, string> = {
  teacher: "Teacher",
  office: "Office / admin clerk",
  textbooks: "Textbook coordinator",
  finance: "Finance",
  facilities: "Facilities / maintenance",
  none: "No access (custom only)",
};

// Granting these to staff would let them widen their own access.
export const NOT_GRANTABLE: readonly Capability[] = ["staff.manage", "school.settings"];

export function isStaffPreset(value: unknown): value is StaffPreset {
  return typeof value === "string" && Object.hasOwn(STAFF_PRESETS, value);
}

export function resolveCapabilities(
  role: Role,
  adjustments: { preset?: string; grant?: string[]; revoke?: string[] } = {},
): Capability[] {
  if (role === "owner" || role === "admin") return [...CAPABILITIES];
  if (role !== "staff") return [];

  const preset = isStaffPreset(adjustments.preset) ? adjustments.preset : "teacher";
  const held = new Set<Capability>(STAFF_PRESETS[preset]);
  // Unknown names are ignored, so a typo can never widen access.
  for (const c of adjustments.grant ?? []) {
    if (isCapability(c) && !NOT_GRANTABLE.includes(c)) held.add(c);
  }
  for (const c of adjustments.revoke ?? []) {
    if (isCapability(c)) held.delete(c);
  }
  return CAPABILITIES.filter((c) => held.has(c));
}

const ROLE_RANK: Record<Role, number> = { staff: 1, admin: 2, owner: 3 };

// Admins manage staff and other admins; only owners touch owners.
export function canManageRole(actor: Role, target: Role): boolean {
  if (actor === "owner") return true;
  if (actor === "admin") return ROLE_RANK[target] <= ROLE_RANK.admin;
  return false;
}
